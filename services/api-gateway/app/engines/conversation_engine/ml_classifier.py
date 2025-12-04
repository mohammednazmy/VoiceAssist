"""
ML Query Classifier - DistilBERT-based Query Classification

Provides:
- Training pipeline from session logs
- ONNX model export for production inference
- Real-time classification with confidence scores
- A/B testing support with heuristic fallback
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class TrainingExample:
    """A single training example"""

    text: str
    query_type: str  # simple, complex, urgent, clarification, command
    domain: str  # medical, calendar, technical, general
    prosody_features: Optional[Dict[str, float]] = None
    emotion_state: Optional[Dict[str, Any]] = None
    timestamp: Optional[datetime] = None
    session_id: Optional[str] = None


@dataclass
class ClassifierMetrics:
    """Classification metrics for evaluation"""

    accuracy: float
    precision: Dict[str, float]
    recall: Dict[str, float]
    f1: Dict[str, float]
    confusion_matrix: List[List[int]]
    class_names: List[str]


@dataclass
class InferenceResult:
    """Result of ML classification"""

    query_type: str
    domain: str
    type_probabilities: Dict[str, float]
    domain_probabilities: Dict[str, float]
    confidence: float
    latency_ms: float
    model_version: str


class QueryClassifierTrainer:
    """
    Training pipeline for DistilBERT-based query classifier.

    Training workflow:
    1. Export session logs from database
    2. Preprocess and tokenize texts
    3. Fine-tune DistilBERT with classification heads
    4. Export to ONNX for production inference
    5. Evaluate on holdout set
    """

    QUERY_TYPES = ["simple", "complex", "urgent", "clarification", "command"]
    DOMAINS = ["medical", "calendar", "technical", "general"]

    # Pinned model version for reproducibility
    DEFAULT_MODEL_NAME = "distilbert-base-uncased"
    DEFAULT_MODEL_REVISION = "043235d6088ecd3dd5fb5ca3592b6f5c53949a5"  # v1.0 stable

    def __init__(
        self,
        model_name: str = "distilbert-base-uncased",
        model_revision: Optional[str] = None,
        max_length: int = 128,
        batch_size: int = 32,
        learning_rate: float = 2e-5,
        epochs: int = 3,
    ):
        self.model_name = model_name
        self.model_revision = model_revision or self.DEFAULT_MODEL_REVISION
        self.max_length = max_length
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.epochs = epochs

        self._model = None
        self._tokenizer = None
        self._is_trained = False

        logger.info(f"QueryClassifierTrainer initialized with {model_name}")

    async def export_training_data(
        self,
        db_session,
        output_path: str,
        min_examples: int = 1000,
    ) -> int:
        """
        Export session logs from database for training.

        Returns number of examples exported.
        """
        from app.models import Message
        from sqlalchemy import and_, select

        # Query recent sessions with messages
        query = (
            select(Message)
            .where(
                and_(
                    Message.role == "user",
                    Message.content.isnot(None),
                )
            )
            .order_by(Message.created_at.desc())
            .limit(min_examples * 2)
        )

        result = await db_session.execute(query)
        messages = result.scalars().all()

        # Prepare training data
        examples = []
        for msg in messages:
            if not msg.content or len(msg.content.strip()) < 5:
                continue

            # Extract metadata if available
            metadata = msg.metadata or {}

            example = {
                "text": msg.content,
                "query_type": metadata.get("query_type", "simple"),
                "domain": metadata.get("domain", "general"),
                "session_id": str(msg.session_id) if msg.session_id else None,
                "timestamp": msg.created_at.isoformat() if msg.created_at else None,
            }
            examples.append(example)

        # Save to file
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, "w") as f:
            json.dump(examples, f, indent=2)

        logger.info(f"Exported {len(examples)} training examples to {output_path}")
        return len(examples)

    async def load_training_data(
        self,
        data_path: str,
    ) -> List[TrainingExample]:
        """Load training data from JSON file"""
        with open(data_path, "r") as f:
            raw_data = json.load(f)

        examples = []
        for item in raw_data:
            examples.append(
                TrainingExample(
                    text=item["text"],
                    query_type=item.get("query_type", "simple"),
                    domain=item.get("domain", "general"),
                    session_id=item.get("session_id"),
                    timestamp=(datetime.fromisoformat(item["timestamp"]) if item.get("timestamp") else None),
                )
            )

        return examples

    async def train(
        self,
        train_examples: List[TrainingExample],
        val_examples: Optional[List[TrainingExample]] = None,
        output_dir: str = "./models/query_classifier",
    ) -> ClassifierMetrics:
        """
        Fine-tune DistilBERT on training examples.

        Returns training metrics.
        """
        try:
            import torch
            from torch.utils.data import Dataset
            from transformers import (
                DistilBertForSequenceClassification,
                DistilBertTokenizer,
                Trainer,
                TrainingArguments,
            )
        except ImportError:
            logger.error("transformers/torch not installed. Run: pip install transformers torch")
            raise

        # Create output directory
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Load tokenizer with pinned revision (nosec B615 - revision pinned)
        self._tokenizer = DistilBertTokenizer.from_pretrained(  # nosec B615
            self.model_name, revision=self.model_revision
        )

        # Prepare labels
        type_labels = {t: i for i, t in enumerate(self.QUERY_TYPES)}
        domain_labels = {d: i for i, d in enumerate(self.DOMAINS)}

        # Create custom dataset
        class QueryDataset(Dataset):
            def __init__(self, examples, tokenizer, max_length, type_labels, domain_labels):
                self.examples = examples
                self.tokenizer = tokenizer
                self.max_length = max_length
                self.type_labels = type_labels
                self.domain_labels = domain_labels

            def __len__(self):
                return len(self.examples)

            def __getitem__(self, idx):
                ex = self.examples[idx]
                encoding = self.tokenizer(
                    ex.text,
                    max_length=self.max_length,
                    padding="max_length",
                    truncation=True,
                    return_tensors="pt",
                )
                return {
                    "input_ids": encoding["input_ids"].squeeze(),
                    "attention_mask": encoding["attention_mask"].squeeze(),
                    "labels": torch.tensor(self.type_labels.get(ex.query_type, 0)),
                }

        # Create datasets
        train_dataset = QueryDataset(train_examples, self._tokenizer, self.max_length, type_labels, domain_labels)

        val_dataset = None
        if val_examples:
            val_dataset = QueryDataset(
                val_examples,
                self._tokenizer,
                self.max_length,
                type_labels,
                domain_labels,
            )

        # Load model with pinned revision (nosec B615 - revision pinned)
        self._model = DistilBertForSequenceClassification.from_pretrained(  # nosec B615
            self.model_name,
            revision=self.model_revision,
            num_labels=len(self.QUERY_TYPES),
        )

        # Training arguments
        training_args = TrainingArguments(
            output_dir=str(output_path),
            num_train_epochs=self.epochs,
            per_device_train_batch_size=self.batch_size,
            per_device_eval_batch_size=self.batch_size,
            learning_rate=self.learning_rate,
            warmup_steps=100,
            weight_decay=0.01,
            logging_dir=str(output_path / "logs"),
            logging_steps=50,
            eval_strategy="epoch" if val_dataset else "no",
            save_strategy="epoch",
            load_best_model_at_end=True if val_dataset else False,
        )

        # Train
        trainer = Trainer(
            model=self._model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
        )

        trainer.train()

        # Save model
        self._model.save_pretrained(str(output_path))
        self._tokenizer.save_pretrained(str(output_path))

        self._is_trained = True
        logger.info(f"Model trained and saved to {output_dir}")

        # Evaluate
        if val_dataset:
            return await self.evaluate(val_examples)

        return ClassifierMetrics(
            accuracy=0.0,
            precision={},
            recall={},
            f1={},
            confusion_matrix=[],
            class_names=self.QUERY_TYPES,
        )

    async def evaluate(
        self,
        test_examples: List[TrainingExample],
    ) -> ClassifierMetrics:
        """Evaluate model on test set"""
        try:
            from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
        except ImportError:
            logger.warning("sklearn not installed, skipping evaluation")
            return ClassifierMetrics(
                accuracy=0.0,
                precision={},
                recall={},
                f1={},
                confusion_matrix=[],
                class_names=self.QUERY_TYPES,
            )

        if not self._model or not self._tokenizer:
            raise ValueError("Model not trained. Call train() first.")

        import torch

        predictions = []
        labels = []
        type_labels = {t: i for i, t in enumerate(self.QUERY_TYPES)}

        self._model.eval()
        with torch.no_grad():
            for ex in test_examples:
                inputs = self._tokenizer(
                    ex.text,
                    max_length=self.max_length,
                    padding="max_length",
                    truncation=True,
                    return_tensors="pt",
                )
                outputs = self._model(**inputs)
                pred = torch.argmax(outputs.logits, dim=1).item()
                predictions.append(pred)
                labels.append(type_labels.get(ex.query_type, 0))

        # Calculate metrics
        accuracy = accuracy_score(labels, predictions)
        precision, recall, f1, _ = precision_recall_fscore_support(
            labels, predictions, labels=range(len(self.QUERY_TYPES)), zero_division=0
        )
        cm = confusion_matrix(labels, predictions, labels=range(len(self.QUERY_TYPES)))

        return ClassifierMetrics(
            accuracy=accuracy,
            precision={t: float(p) for t, p in zip(self.QUERY_TYPES, precision)},
            recall={t: float(r) for t, r in zip(self.QUERY_TYPES, recall)},
            f1={t: float(f) for t, f in zip(self.QUERY_TYPES, f1)},
            confusion_matrix=cm.tolist(),
            class_names=self.QUERY_TYPES,
        )

    async def export_onnx(
        self,
        output_path: str = "./models/query_classifier/model.onnx",
    ) -> str:
        """
        Export trained model to ONNX for production inference.

        ONNX provides:
        - Faster inference (no Python GIL)
        - Smaller memory footprint
        - Cross-platform deployment
        """
        if not self._model or not self._tokenizer:
            raise ValueError("Model not trained. Call train() first.")

        import torch

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Create dummy input
        dummy_input = self._tokenizer(
            "What is the patient's blood pressure?",
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )

        # Export to ONNX
        self._model.eval()
        torch.onnx.export(
            self._model,
            (dummy_input["input_ids"], dummy_input["attention_mask"]),
            str(output_file),
            input_names=["input_ids", "attention_mask"],
            output_names=["logits"],
            dynamic_axes={
                "input_ids": {0: "batch_size"},
                "attention_mask": {0: "batch_size"},
                "logits": {0: "batch_size"},
            },
            opset_version=14,
        )

        logger.info(f"Model exported to ONNX: {output_path}")
        return str(output_file)


class MLQueryClassifier:
    """
    Production ML classifier using ONNX runtime.

    Features:
    - Fast ONNX inference
    - Confidence thresholds
    - Fallback to heuristics
    - A/B test variant tracking
    """

    QUERY_TYPES = ["simple", "complex", "urgent", "clarification", "command"]
    DOMAINS = ["medical", "calendar", "technical", "general"]

    def __init__(
        self,
        model_path: Optional[str] = None,
        tokenizer_path: Optional[str] = None,
        confidence_threshold: float = 0.6,
        use_heuristic_fallback: bool = True,
    ):
        self.model_path = model_path
        self.tokenizer_path = tokenizer_path
        self.confidence_threshold = confidence_threshold
        self.use_heuristic_fallback = use_heuristic_fallback

        self._session = None
        self._tokenizer = None
        self._is_loaded = False
        self._model_version = "unknown"

        logger.info("MLQueryClassifier initialized")

    async def load(self) -> bool:
        """Load ONNX model and tokenizer"""
        if not self.model_path or not self.tokenizer_path:
            logger.warning("Model/tokenizer path not configured")
            return False

        try:
            import onnxruntime as ort
            from transformers import DistilBertTokenizer

            # Load ONNX model
            self._session = ort.InferenceSession(
                self.model_path,
                providers=["CPUExecutionProvider"],
            )

            # Load tokenizer from local path (no revision needed - not downloading from HuggingFace)
            # nosec B615 - tokenizer_path is a local file path, not a HuggingFace model ID
            self._tokenizer = DistilBertTokenizer.from_pretrained(self.tokenizer_path)

            # Get model version from path
            self._model_version = Path(self.model_path).parent.name

            self._is_loaded = True
            logger.info(f"Loaded ML classifier from {self.model_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to load ML classifier: {e}")
            return False

    async def classify(
        self,
        text: str,
        prosody_features: Optional[Dict[str, float]] = None,
        emotion_state: Optional[Dict[str, Any]] = None,
    ) -> InferenceResult:
        """
        Classify query using ML model.

        Falls back to heuristics if:
        - Model not loaded
        - Confidence below threshold
        """
        import time

        start_time = time.time()

        if not self._is_loaded:
            # Fall back to simple heuristics
            return self._heuristic_classify(text, start_time)

        try:
            import numpy as np

            # Tokenize
            inputs = self._tokenizer(
                text,
                max_length=128,
                padding="max_length",
                truncation=True,
                return_tensors="np",
            )

            # Run inference
            outputs = self._session.run(
                None,
                {
                    "input_ids": inputs["input_ids"].astype(np.int64),
                    "attention_mask": inputs["attention_mask"].astype(np.int64),
                },
            )

            logits = outputs[0][0]
            probabilities = self._softmax(logits)

            # Get predictions
            type_idx = int(np.argmax(probabilities))
            query_type = self.QUERY_TYPES[type_idx]
            confidence = float(probabilities[type_idx])

            # Check confidence threshold
            if confidence < self.confidence_threshold and self.use_heuristic_fallback:
                return self._heuristic_classify(text, start_time)

            # Determine domain (simplified - could use separate model)
            domain = self._detect_domain(text)

            latency_ms = (time.time() - start_time) * 1000

            return InferenceResult(
                query_type=query_type,
                domain=domain,
                type_probabilities={t: float(p) for t, p in zip(self.QUERY_TYPES, probabilities)},
                domain_probabilities={},  # Would need separate model
                confidence=confidence,
                latency_ms=latency_ms,
                model_version=self._model_version,
            )

        except Exception as e:
            logger.error(f"ML classification failed: {e}")
            return self._heuristic_classify(text, start_time)

    def _softmax(self, x: np.ndarray) -> np.ndarray:
        """Compute softmax probabilities"""
        import numpy as np

        exp_x = np.exp(x - np.max(x))
        return exp_x / exp_x.sum()

    def _heuristic_classify(
        self,
        text: str,
        start_time: float,
    ) -> InferenceResult:
        """Simple heuristic classification as fallback"""
        import time

        text_lower = text.lower()
        words = text_lower.split()
        word_count = len(words)

        # Determine query type
        if any(w in text_lower for w in ["urgent", "emergency", "stat", "critical"]):
            query_type = "urgent"
            confidence = 0.9
        elif any(w in text_lower for w in ["do", "make", "create", "schedule", "order"]):
            query_type = "command"
            confidence = 0.8
        elif "?" in text and word_count < 10:
            query_type = "simple"
            confidence = 0.7
        elif word_count > 20:
            query_type = "complex"
            confidence = 0.65
        else:
            query_type = "simple"
            confidence = 0.6

        domain = self._detect_domain(text)
        latency_ms = (time.time() - start_time) * 1000

        return InferenceResult(
            query_type=query_type,
            domain=domain,
            type_probabilities={query_type: confidence},
            domain_probabilities={domain: 0.8},
            confidence=confidence,
            latency_ms=latency_ms,
            model_version="heuristic",
        )

    def _detect_domain(self, text: str) -> str:
        """Detect query domain using keywords"""
        text_lower = text.lower()

        medical_words = {
            "patient",
            "medication",
            "diagnosis",
            "symptom",
            "prescription",
            "lab",
            "vital",
            "blood",
            "pain",
            "dose",
        }
        calendar_words = {
            "schedule",
            "meeting",
            "appointment",
            "calendar",
            "remind",
            "time",
        }
        technical_words = {"system", "error", "code", "debug", "deploy", "server"}

        if any(w in text_lower for w in medical_words):
            return "medical"
        elif any(w in text_lower for w in calendar_words):
            return "calendar"
        elif any(w in text_lower for w in technical_words):
            return "technical"
        else:
            return "general"


__all__ = [
    "QueryClassifierTrainer",
    "MLQueryClassifier",
    "TrainingExample",
    "ClassifierMetrics",
    "InferenceResult",
]
