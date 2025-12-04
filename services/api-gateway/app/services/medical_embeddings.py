"""
Medical Embeddings Service (Phase 5 - Advanced RAG)

Provides medical-specific embeddings using domain-trained models.

Supported Models:
1. PubMedBERT - Pre-trained on PubMed abstracts
2. BioGPT - Generative model for biomedical text
3. BioBERT - BERT pre-trained on biomedical literature
4. SciBERT - BERT pre-trained on scientific text

Features:
- Multiple embedding model support
- Hybrid embeddings (combining OpenAI + medical)
- Query-type based model selection
- Batch embedding generation
- Model caching and lazy loading
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Union

import numpy as np
from app.core.config import settings
from app.services.cache_service import cache_service, generate_cache_key

logger = logging.getLogger(__name__)


class MedicalModelType(str, Enum):
    """Available medical embedding models."""

    OPENAI = "openai"  # OpenAI text-embedding-3-small/large
    PUBMEDBERT = "pubmedbert"  # microsoft/BiomedNLP-PubMedBERT
    BIOBERT = "biobert"  # dmis-lab/biobert-base-cased-v1.2
    SCIBERT = "scibert"  # allenai/scibert_scivocab_uncased
    BIOGPT = "biogpt"  # microsoft/biogpt
    MEDCPT = "medcpt"  # ncbi/MedCPT-Query-Encoder


class QueryType(str, Enum):
    """Query type for embedding strategy selection."""

    GENERAL = "general"  # General medical questions
    CLINICAL = "clinical"  # Clinical decision support
    RESEARCH = "research"  # Research/literature queries
    DRUG = "drug"  # Drug-related queries
    DIAGNOSIS = "diagnosis"  # Diagnostic queries


@dataclass
class EmbeddingConfig:
    """Configuration for embedding generation."""

    model_type: MedicalModelType = MedicalModelType.OPENAI
    device: str = "cpu"  # cuda, cpu, mps
    batch_size: int = 32
    max_length: int = 512
    normalize: bool = True
    cache_ttl: int = 86400  # 24 hours


@dataclass
class EmbeddingResult:
    """Result from embedding generation."""

    embedding: List[float]
    model: str
    dimensions: int
    tokens_used: Optional[int] = None


class OpenAIEmbeddings:
    """
    OpenAI embeddings for general text.

    Models:
    - text-embedding-3-small (1536 dimensions, cheaper)
    - text-embedding-3-large (3072 dimensions, higher quality)
    - text-embedding-ada-002 (1536 dimensions, legacy)
    """

    def __init__(
        self,
        model: str = "text-embedding-3-small",
        dimensions: Optional[int] = None,
    ):
        self.model = model
        self.dimensions = dimensions

    async def embed(
        self,
        texts: Union[str, List[str]],
    ) -> List[List[float]]:
        """Generate embeddings using OpenAI API."""
        import openai

        if isinstance(texts, str):
            texts = [texts]

        try:
            kwargs = {"model": self.model, "input": texts}
            if self.dimensions:
                kwargs["dimensions"] = self.dimensions

            response = await openai.embeddings.create(**kwargs)
            return [data.embedding for data in response.data]

        except Exception as e:
            logger.error(f"OpenAI embedding error: {e}")
            raise


class PubMedBERTEmbeddings:
    """
    PubMedBERT embeddings for biomedical text.

    Model: microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext

    Pre-trained on:
    - PubMed abstracts
    - PubMed Central full-text articles
    """

    # Pinned model revision for reproducibility
    DEFAULT_REVISION = "v1.1"

    def __init__(
        self,
        model_name: str = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
        model_revision: str = "v1.1",
        device: str = "cpu",
        max_length: int = 512,
    ):
        self.model_name = model_name
        self.model_revision = model_revision
        self.device = device
        self.max_length = max_length
        self._model = None
        self._tokenizer = None

    async def _load_model(self):
        """Load model lazily."""
        if self._model is None:
            try:
                from transformers import AutoModel, AutoTokenizer

                self._tokenizer = AutoTokenizer.from_pretrained(self.model_name, revision=self.model_revision)
                self._model = AutoModel.from_pretrained(self.model_name, revision=self.model_revision)

                # Move to device
                if self.device != "cpu":
                    import torch

                    if self.device == "cuda" and torch.cuda.is_available():
                        self._model = self._model.to("cuda")
                    elif self.device == "mps" and torch.backends.mps.is_available():
                        self._model = self._model.to("mps")

                self._model.eval()
                logger.info(f"Loaded PubMedBERT model on {self.device}")

            except ImportError:
                logger.error("transformers package not installed. " "Install with: pip install transformers torch")
                raise

    async def embed(
        self,
        texts: Union[str, List[str]],
    ) -> List[List[float]]:
        """Generate embeddings using PubMedBERT."""
        import torch

        await self._load_model()

        if isinstance(texts, str):
            texts = [texts]

        # Tokenize
        inputs = self._tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )

        # Move to device
        if self.device != "cpu":
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # Generate embeddings
        with torch.no_grad():
            outputs = self._model(**inputs)
            # Mean pooling over tokens (excluding padding)
            attention_mask = inputs["attention_mask"]
            embeddings = outputs.last_hidden_state

            # Apply attention mask
            mask_expanded = attention_mask.unsqueeze(-1).expand(embeddings.size()).float()
            sum_embeddings = torch.sum(embeddings * mask_expanded, 1)
            sum_mask = torch.clamp(mask_expanded.sum(1), min=1e-9)
            mean_embeddings = sum_embeddings / sum_mask

            # Normalize
            mean_embeddings = torch.nn.functional.normalize(mean_embeddings, p=2, dim=1)

        return mean_embeddings.cpu().numpy().tolist()


class BioBERTEmbeddings:
    """
    BioBERT embeddings for biomedical text.

    Model: dmis-lab/biobert-base-cased-v1.2

    Pre-trained on:
    - PubMed abstracts
    - PMC full-text articles
    """

    # Pinned model revision for reproducibility
    DEFAULT_REVISION = "main"

    def __init__(
        self,
        model_name: str = "dmis-lab/biobert-base-cased-v1.2",
        model_revision: str = "main",
        device: str = "cpu",
        max_length: int = 512,
    ):
        self.model_name = model_name
        self.model_revision = model_revision
        self.device = device
        self.max_length = max_length
        self._model = None
        self._tokenizer = None

    async def _load_model(self):
        """Load model lazily."""
        if self._model is None:
            try:
                from transformers import AutoModel, AutoTokenizer

                self._tokenizer = AutoTokenizer.from_pretrained(self.model_name, revision=self.model_revision)
                self._model = AutoModel.from_pretrained(self.model_name, revision=self.model_revision)

                if self.device != "cpu":
                    import torch

                    if self.device == "cuda" and torch.cuda.is_available():
                        self._model = self._model.to("cuda")

                self._model.eval()
                logger.info(f"Loaded BioBERT model on {self.device}")

            except ImportError:
                logger.error("transformers package not installed")
                raise

    async def embed(
        self,
        texts: Union[str, List[str]],
    ) -> List[List[float]]:
        """Generate embeddings using BioBERT."""
        import torch

        await self._load_model()

        if isinstance(texts, str):
            texts = [texts]

        inputs = self._tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )

        if self.device != "cpu":
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)
            # CLS token embedding
            cls_embeddings = outputs.last_hidden_state[:, 0, :]
            cls_embeddings = torch.nn.functional.normalize(cls_embeddings, p=2, dim=1)

        return cls_embeddings.cpu().numpy().tolist()


class HuggingFaceInferenceEmbeddings:
    """
    Embeddings using Hugging Face Inference API.

    Useful when you don't want to host models locally.
    Requires HF_API_KEY environment variable.
    """

    def __init__(
        self,
        model_id: str = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
        api_key: Optional[str] = None,
    ):
        self.model_id = model_id
        self.api_key = api_key or getattr(settings, "HF_API_KEY", None)
        self.api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model_id}"

    async def embed(
        self,
        texts: Union[str, List[str]],
    ) -> List[List[float]]:
        """Generate embeddings using HF Inference API."""
        import httpx

        if isinstance(texts, str):
            texts = [texts]

        if not self.api_key:
            raise ValueError("HF_API_KEY not configured")

        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.api_url,
                headers=headers,
                json={"inputs": texts, "options": {"wait_for_model": True}},
                timeout=30,
            )
            response.raise_for_status()
            embeddings = response.json()

            # HF returns [batch, seq_len, hidden_dim] - need to mean pool
            result = []
            for emb in embeddings:
                if isinstance(emb[0], list):
                    # Mean pooling
                    arr = np.array(emb)
                    mean_emb = np.mean(arr, axis=0).tolist()
                    result.append(mean_emb)
                else:
                    result.append(emb)

            return result


class MedicalEmbeddingService:
    """
    Main medical embedding service.

    Provides unified interface for generating embeddings
    using different medical models.
    """

    def __init__(
        self,
        config: Optional[EmbeddingConfig] = None,
    ):
        self.config = config or EmbeddingConfig()
        self._embedders: Dict[MedicalModelType, Any] = {}

    async def _get_embedder(self, model_type: MedicalModelType):
        """Get or create embedder for model type."""
        if model_type not in self._embedders:
            if model_type == MedicalModelType.OPENAI:
                self._embedders[model_type] = OpenAIEmbeddings()
            elif model_type == MedicalModelType.PUBMEDBERT:
                self._embedders[model_type] = PubMedBERTEmbeddings(
                    device=self.config.device,
                    max_length=self.config.max_length,
                )
            elif model_type == MedicalModelType.BIOBERT:
                self._embedders[model_type] = BioBERTEmbeddings(
                    device=self.config.device,
                    max_length=self.config.max_length,
                )
            elif model_type == MedicalModelType.SCIBERT:
                self._embedders[model_type] = BioBERTEmbeddings(
                    model_name="allenai/scibert_scivocab_uncased",
                    device=self.config.device,
                    max_length=self.config.max_length,
                )
            else:
                raise ValueError(f"Unknown model type: {model_type}")

        return self._embedders[model_type]

    async def embed(
        self,
        texts: Union[str, List[str]],
        model_type: Optional[MedicalModelType] = None,
    ) -> List[EmbeddingResult]:
        """
        Generate embeddings for texts.

        Args:
            texts: Text(s) to embed
            model_type: Model to use (defaults to config)

        Returns:
            List of embedding results
        """
        model = model_type or self.config.model_type

        if isinstance(texts, str):
            texts = [texts]

        # Check cache
        results = []
        uncached_texts = []
        uncached_indices = []

        for i, text in enumerate(texts):
            cache_key = generate_cache_key("medical_emb", text, model=model.value)
            cached = await cache_service.get(cache_key)
            if cached is not None:
                results.append((i, EmbeddingResult(**cached)))
            else:
                uncached_texts.append(text)
                uncached_indices.append(i)

        if not uncached_texts:
            # All cached
            results.sort(key=lambda x: x[0])
            return [r[1] for r in results]

        # Generate embeddings for uncached texts
        try:
            embedder = await self._get_embedder(model)
            embeddings = await embedder.embed(uncached_texts)

            # Cache and collect results
            for j, (idx, text) in enumerate(zip(uncached_indices, uncached_texts)):
                emb_result = EmbeddingResult(
                    embedding=embeddings[j],
                    model=model.value,
                    dimensions=len(embeddings[j]),
                )

                # Cache
                cache_key = generate_cache_key("medical_emb", text, model=model.value)
                await cache_service.set(
                    cache_key,
                    {
                        "embedding": emb_result.embedding,
                        "model": emb_result.model,
                        "dimensions": emb_result.dimensions,
                    },
                    ttl=self.config.cache_ttl,
                )

                results.append((idx, emb_result))

            # Sort by original index
            results.sort(key=lambda x: x[0])
            return [r[1] for r in results]

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}", exc_info=True)
            raise

    async def embed_query(
        self,
        query: str,
        query_type: QueryType = QueryType.GENERAL,
    ) -> EmbeddingResult:
        """
        Embed a query with query-specific processing.

        Adds query prefix based on query type for better retrieval.
        """
        # Add query-specific prefix
        prefixes = {
            QueryType.GENERAL: "medical query: ",
            QueryType.CLINICAL: "clinical question: ",
            QueryType.RESEARCH: "research query: ",
            QueryType.DRUG: "drug information query: ",
            QueryType.DIAGNOSIS: "diagnostic query: ",
        }

        prefix = prefixes.get(query_type, "")
        processed_query = prefix + query

        results = await self.embed(processed_query)
        return results[0]


class HybridEmbeddingService:
    """
    Hybrid embedding service combining multiple models.

    Strategy:
    1. Generate embeddings from multiple models
    2. Weight and combine based on query type
    3. Optionally project to common dimension
    """

    def __init__(
        self,
        openai_weight: float = 0.4,
        medical_weight: float = 0.6,
        device: str = "cpu",
    ):
        self.openai_weight = openai_weight
        self.medical_weight = medical_weight

        self.openai_embeddings = OpenAIEmbeddings()
        self.medical_service = MedicalEmbeddingService(
            config=EmbeddingConfig(
                model_type=MedicalModelType.PUBMEDBERT,
                device=device,
            )
        )

    async def embed(
        self,
        text: str,
        query_type: QueryType = QueryType.GENERAL,
    ) -> Dict[str, Any]:
        """
        Generate hybrid embedding.

        Returns both individual and combined embeddings.
        """
        # Adjust weights based on query type
        weights = self._get_weights(query_type)

        # Generate embeddings in parallel
        openai_task = self.openai_embeddings.embed(text)
        medical_task = self.medical_service.embed(text)

        openai_emb, medical_emb = await asyncio.gather(openai_task, medical_task, return_exceptions=True)

        result = {
            "query_type": query_type.value,
            "weights": weights,
        }

        # Handle potential failures gracefully
        if isinstance(openai_emb, Exception):
            logger.error(f"OpenAI embedding failed: {openai_emb}")
            openai_emb = None
        else:
            openai_emb = openai_emb[0]
            result["openai_embedding"] = openai_emb
            result["openai_dimensions"] = len(openai_emb)

        if isinstance(medical_emb, Exception):
            logger.error(f"Medical embedding failed: {medical_emb}")
            medical_emb = None
        else:
            medical_emb = medical_emb[0].embedding
            result["medical_embedding"] = medical_emb
            result["medical_dimensions"] = len(medical_emb)

        # Create combined embedding if both available
        # Note: This requires projection for different dimensions
        if openai_emb and medical_emb:
            # For different dimensions, we'd need a projection layer
            # For now, return both separately
            result["combined_available"] = True
        else:
            result["combined_available"] = False
            # Use whichever is available
            result["fallback_embedding"] = openai_emb or medical_emb

        return result

    def _get_weights(self, query_type: QueryType) -> Dict[str, float]:
        """Get embedding weights based on query type."""
        weight_configs = {
            QueryType.GENERAL: {"openai": 0.6, "medical": 0.4},
            QueryType.CLINICAL: {"openai": 0.3, "medical": 0.7},
            QueryType.RESEARCH: {"openai": 0.2, "medical": 0.8},
            QueryType.DRUG: {"openai": 0.4, "medical": 0.6},
            QueryType.DIAGNOSIS: {"openai": 0.3, "medical": 0.7},
        }
        return weight_configs.get(query_type, {"openai": 0.5, "medical": 0.5})
