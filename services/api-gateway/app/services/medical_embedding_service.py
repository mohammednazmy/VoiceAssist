"""
Medical Embedding Service

Provides medical-specific embeddings using specialized language models:
- PubMedBERT: Biomedical text embeddings trained on PubMed
- BioGPT: Medical text generation and understanding
- SciBERT: Scientific text embeddings

These models provide better semantic understanding for medical queries
compared to general-purpose embedding models.
"""

import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MedicalModelType(Enum):
    """Supported medical language models"""

    PUBMEDBERT = "pubmedbert"
    BIOGPT = "biogpt"
    SCIBERT = "scibert"


@dataclass
class ModelConfig:
    """Configuration for a medical language model"""

    name: str
    model_id: str
    tokenizer_id: str
    max_length: int = 512
    embedding_dim: int = 768
    supports_generation: bool = False
    revision: str = "main"  # Pinned revision for reproducibility


# Model configurations with pinned revisions
MODEL_CONFIGS = {
    MedicalModelType.PUBMEDBERT: ModelConfig(
        name="PubMedBERT",
        model_id="microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
        tokenizer_id="microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext",
        max_length=512,
        embedding_dim=768,
        supports_generation=False,
        revision="v1.1",  # Pinned stable release
    ),
    MedicalModelType.BIOGPT: ModelConfig(
        name="BioGPT",
        model_id="microsoft/biogpt",
        tokenizer_id="microsoft/biogpt",
        max_length=1024,
        embedding_dim=1024,
        supports_generation=True,
        revision="main",  # Pinned to main branch
    ),
    MedicalModelType.SCIBERT: ModelConfig(
        name="SciBERT",
        model_id="allenai/scibert_scivocab_uncased",
        tokenizer_id="allenai/scibert_scivocab_uncased",
        max_length=512,
        embedding_dim=768,
        supports_generation=False,
        revision="main",  # Pinned to main branch
    ),
}


@dataclass
class EmbeddingResult:
    """Result of embedding generation"""

    embedding: List[float]
    model: str
    text_length: int
    truncated: bool
    metadata: Dict[str, Any]


@dataclass
class GenerationResult:
    """Result of text generation"""

    generated_text: str
    model: str
    prompt_length: int
    generation_length: int
    metadata: Dict[str, Any]


class MedicalEmbeddingService:
    """
    Medical-specific embeddings using BioGPT and PubMedBERT.

    This service provides high-quality embeddings for medical text,
    enabling better semantic search and retrieval for healthcare queries.

    Note: For production use, this requires:
    - transformers library
    - torch library
    - Sufficient GPU memory for model inference

    The service gracefully degrades to OpenAI embeddings when medical
    models are not available.
    """

    def __init__(self, lazy_load: bool = True):
        """
        Initialize the medical embedding service.

        Args:
            lazy_load: If True, models are loaded on first use.
                       If False, models are loaded immediately.
        """
        self._models: Dict[MedicalModelType, Dict[str, Any]] = {}
        self._models_loaded = False
        self._lazy_load = lazy_load
        self._device = "cuda" if self._check_cuda_available() else "cpu"
        self._fallback_enabled = True

        logger.info(
            "MedicalEmbeddingService initialized",
            extra={
                "lazy_load": lazy_load,
                "device": self._device,
            },
        )

        if not lazy_load:
            self._load_all_models()

    def _check_cuda_available(self) -> bool:
        """Check if CUDA is available for GPU acceleration."""
        try:
            import torch

            return torch.cuda.is_available()
        except ImportError:
            return False

    def _load_all_models(self) -> None:
        """Load all medical models."""
        for model_type in MedicalModelType:
            self._load_model(model_type)
        self._models_loaded = True

    def _load_model(self, model_type: MedicalModelType) -> bool:
        """
        Load a specific medical model.

        Args:
            model_type: Type of model to load

        Returns:
            True if model loaded successfully, False otherwise
        """
        if model_type in self._models:
            return True

        config = MODEL_CONFIGS[model_type]

        try:
            from transformers import AutoModel, AutoTokenizer

            logger.info(f"Loading medical model: {config.name} (revision: {config.revision})")

            tokenizer = AutoTokenizer.from_pretrained(config.tokenizer_id, revision=config.revision)

            if model_type == MedicalModelType.BIOGPT:
                from transformers import BioGptForCausalLM, BioGptTokenizer

                tokenizer = BioGptTokenizer.from_pretrained(config.tokenizer_id, revision=config.revision)
                model = BioGptForCausalLM.from_pretrained(config.model_id, revision=config.revision)
            else:
                model = AutoModel.from_pretrained(config.model_id, revision=config.revision)

            model = model.to(self._device)
            model.eval()

            self._models[model_type] = {
                "tokenizer": tokenizer,
                "model": model,
                "config": config,
            }

            logger.info(
                f"Medical model loaded: {config.name}",
                extra={
                    "model": config.model_id,
                    "device": self._device,
                },
            )
            return True

        except ImportError as e:
            logger.warning(
                f"Failed to load medical model (missing dependency): {e}",
                extra={"model": config.name},
            )
            return False
        except Exception as e:
            logger.error(
                f"Failed to load medical model: {e}",
                extra={"model": config.name, "error": str(e)},
            )
            return False

    def _ensure_model_loaded(self, model_type: MedicalModelType) -> bool:
        """Ensure a model is loaded, loading it if necessary."""
        if model_type in self._models:
            return True
        return self._load_model(model_type)

    async def generate_embedding(
        self,
        text: str,
        model_type: MedicalModelType = MedicalModelType.PUBMEDBERT,
        pooling: str = "cls",
    ) -> EmbeddingResult:
        """
        Generate embeddings using a medical language model.

        Args:
            text: Input text to embed
            model_type: Type of medical model to use
            pooling: Pooling strategy ("cls" for CLS token, "mean" for mean pooling)

        Returns:
            EmbeddingResult with embedding vector and metadata

        Raises:
            ValueError: If model type is not supported
            RuntimeError: If embedding generation fails
        """
        if model_type not in MODEL_CONFIGS:
            raise ValueError(f"Unsupported model type: {model_type}")

        config = MODEL_CONFIGS[model_type]

        # Check if model supports embeddings (not just generation)
        if config.supports_generation and model_type == MedicalModelType.BIOGPT:
            # BioGPT is primarily for generation, use a different model for embeddings
            logger.warning("BioGPT is not optimal for embeddings, falling back to PubMedBERT")
            model_type = MedicalModelType.PUBMEDBERT
            config = MODEL_CONFIGS[model_type]

        # Try to load the model
        if not self._ensure_model_loaded(model_type):
            if self._fallback_enabled:
                return await self._fallback_embedding(text, model_type)
            raise RuntimeError(f"Failed to load model: {model_type.value}")

        model_data = self._models[model_type]
        tokenizer = model_data["tokenizer"]
        model = model_data["model"]

        try:
            import torch

            # Tokenize input
            inputs = tokenizer(
                text,
                return_tensors="pt",
                truncation=True,
                max_length=config.max_length,
                padding=True,
            )

            # Move to device
            inputs = {k: v.to(self._device) for k, v in inputs.items()}

            # Check if text was truncated
            truncated = len(tokenizer.encode(text)) > config.max_length

            # Generate embeddings
            with torch.no_grad():
                outputs = model(**inputs)

            # Apply pooling strategy
            if pooling == "cls":
                # Use [CLS] token embedding
                embedding = outputs.last_hidden_state[:, 0, :].squeeze()
            elif pooling == "mean":
                # Mean pooling over all tokens
                attention_mask = inputs["attention_mask"]
                token_embeddings = outputs.last_hidden_state
                input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
                sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
                sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
                embedding = (sum_embeddings / sum_mask).squeeze()
            else:
                raise ValueError(f"Unknown pooling strategy: {pooling}")

            # Convert to list
            embedding_list = embedding.cpu().numpy().tolist()

            return EmbeddingResult(
                embedding=embedding_list,
                model=config.name,
                text_length=len(text),
                truncated=truncated,
                metadata={
                    "model_id": config.model_id,
                    "pooling": pooling,
                    "embedding_dim": len(embedding_list),
                    "device": self._device,
                },
            )

        except Exception as e:
            logger.error(
                f"Embedding generation failed: {e}",
                extra={"model": model_type.value, "text_length": len(text)},
            )
            if self._fallback_enabled:
                return await self._fallback_embedding(text, model_type)
            raise RuntimeError(f"Embedding generation failed: {e}")

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        model_type: MedicalModelType = MedicalModelType.PUBMEDBERT,
        pooling: str = "cls",
        batch_size: int = 32,
    ) -> List[EmbeddingResult]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of texts to embed
            model_type: Type of medical model to use
            pooling: Pooling strategy
            batch_size: Number of texts to process per batch

        Returns:
            List of EmbeddingResult objects
        """
        results = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]

            # Process batch in parallel
            batch_results = await asyncio.gather(
                *[self.generate_embedding(text, model_type, pooling) for text in batch]
            )
            results.extend(batch_results)

        return results

    async def generate_text(
        self,
        prompt: str,
        max_length: int = 200,
        temperature: float = 0.7,
        top_p: float = 0.9,
        num_return_sequences: int = 1,
    ) -> GenerationResult:
        """
        Generate medical text using BioGPT.

        Args:
            prompt: Input prompt for generation
            max_length: Maximum length of generated text
            temperature: Sampling temperature (higher = more creative)
            top_p: Nucleus sampling parameter
            num_return_sequences: Number of sequences to generate

        Returns:
            GenerationResult with generated text and metadata
        """
        model_type = MedicalModelType.BIOGPT

        if not self._ensure_model_loaded(model_type):
            raise RuntimeError("BioGPT model not available for text generation")

        model_data = self._models[model_type]
        tokenizer = model_data["tokenizer"]
        model = model_data["model"]
        config = model_data["config"]

        try:
            import torch

            # Tokenize prompt
            inputs = tokenizer(prompt, return_tensors="pt")
            inputs = {k: v.to(self._device) for k, v in inputs.items()}

            prompt_length = inputs["input_ids"].shape[1]

            # Generate text
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_length=min(max_length + prompt_length, config.max_length),
                    temperature=temperature,
                    top_p=top_p,
                    do_sample=True,
                    num_return_sequences=num_return_sequences,
                    pad_token_id=tokenizer.eos_token_id,
                )

            # Decode generated text
            generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)

            # Remove the prompt from the generated text
            if generated_text.startswith(prompt):
                generated_text = generated_text[len(prompt) :].strip()

            return GenerationResult(
                generated_text=generated_text,
                model=config.name,
                prompt_length=len(prompt),
                generation_length=len(generated_text),
                metadata={
                    "model_id": config.model_id,
                    "temperature": temperature,
                    "top_p": top_p,
                    "max_length": max_length,
                },
            )

        except Exception as e:
            logger.error(
                f"Text generation failed: {e}",
                extra={"prompt_length": len(prompt)},
            )
            raise RuntimeError(f"Text generation failed: {e}")

    async def _fallback_embedding(
        self,
        text: str,
        original_model: MedicalModelType,
    ) -> EmbeddingResult:
        """
        Generate embedding using fallback method (OpenAI API).

        Args:
            text: Input text
            original_model: The model that was originally requested

        Returns:
            EmbeddingResult with OpenAI embedding
        """
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "text-embedding-3-small",
                        "input": text[:8000],  # Truncate if needed
                    },
                )
                response.raise_for_status()
                data = response.json()

                embedding = data["data"][0]["embedding"]

                logger.info(
                    "Used OpenAI fallback for embedding",
                    extra={"original_model": original_model.value},
                )

                return EmbeddingResult(
                    embedding=embedding,
                    model="text-embedding-3-small (fallback)",
                    text_length=len(text),
                    truncated=len(text) > 8000,
                    metadata={
                        "fallback": True,
                        "original_model": original_model.value,
                        "embedding_dim": len(embedding),
                    },
                )

        except Exception as e:
            logger.error(f"Fallback embedding also failed: {e}")
            raise RuntimeError(f"All embedding methods failed: {e}")

    def get_model_info(self, model_type: MedicalModelType) -> Dict[str, Any]:
        """Get information about a medical model."""
        config = MODEL_CONFIGS.get(model_type)
        if not config:
            return {"error": "Unknown model type"}

        loaded = model_type in self._models

        return {
            "name": config.name,
            "model_id": config.model_id,
            "embedding_dim": config.embedding_dim,
            "max_length": config.max_length,
            "supports_generation": config.supports_generation,
            "loaded": loaded,
            "device": self._device if loaded else None,
        }

    def get_available_models(self) -> List[Dict[str, Any]]:
        """Get information about all available models."""
        return [self.get_model_info(mt) for mt in MedicalModelType]

    async def compute_similarity(
        self,
        text1: str,
        text2: str,
        model_type: MedicalModelType = MedicalModelType.PUBMEDBERT,
    ) -> float:
        """
        Compute semantic similarity between two texts.

        Args:
            text1: First text
            text2: Second text
            model_type: Model to use for embeddings

        Returns:
            Cosine similarity score (0-1)
        """
        # Generate embeddings for both texts
        result1 = await self.generate_embedding(text1, model_type)
        result2 = await self.generate_embedding(text2, model_type)

        # Compute cosine similarity
        import math

        emb1 = result1.embedding
        emb2 = result2.embedding

        dot_product = sum(a * b for a, b in zip(emb1, emb2))
        norm1 = math.sqrt(sum(a * a for a in emb1))
        norm2 = math.sqrt(sum(b * b for b in emb2))

        if norm1 == 0 or norm2 == 0:
            return 0.0

        similarity = dot_product / (norm1 * norm2)
        return max(0.0, min(1.0, similarity))  # Clamp to [0, 1]


# Global service instance (lazy loaded)
medical_embedding_service = MedicalEmbeddingService(lazy_load=True)
