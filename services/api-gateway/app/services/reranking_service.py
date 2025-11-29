"""
Re-ranking Service (Phase 5 - Advanced RAG)

Provides cross-encoder re-ranking for improved search relevance.

Features:
- Cross-encoder scoring (query-document pair classification)
- Multiple re-ranking strategies
- Cohere Rerank API integration
- Local cross-encoder model support (sentence-transformers)
- Score calibration and normalization

Re-ranking improves precision by scoring each document
against the query, rather than relying only on embedding similarity.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.services.cache_service import cache_service, generate_cache_key
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Shared async OpenAI client
_async_openai_client: AsyncOpenAI | None = None


def get_async_openai_client() -> AsyncOpenAI:
    """Get or create async OpenAI client."""
    global _async_openai_client
    if _async_openai_client is None:
        _async_openai_client = AsyncOpenAI()
    return _async_openai_client


class RerankerType(str, Enum):
    """Available re-ranker types."""

    COHERE = "cohere"  # Cohere Rerank API
    OPENAI = "openai"  # OpenAI embeddings similarity
    CROSS_ENCODER = "cross_encoder"  # Local cross-encoder model
    LLM_BASED = "llm_based"  # LLM-based re-ranking
    NONE = "none"  # No re-ranking


@dataclass
class RerankedResult:
    """Result with re-ranking score."""

    chunk_id: str
    document_id: str
    content: str
    original_score: float
    rerank_score: float
    final_score: float
    metadata: Dict[str, Any]


@dataclass
class RerankerConfig:
    """Configuration for re-ranker."""

    reranker_type: RerankerType = RerankerType.COHERE
    top_n: int = 10  # Number of results to return after re-ranking
    model: str = "rerank-english-v3.0"  # Cohere model
    score_weight: float = 0.7  # Weight for rerank score vs original
    min_relevance_score: float = 0.0
    cache_ttl: int = 3600  # Cache TTL in seconds


class CohereReranker:
    """
    Re-ranker using Cohere Rerank API.

    Cohere Rerank provides high-quality cross-encoder re-ranking
    with support for multiple languages and domains.

    Models:
    - rerank-english-v3.0: English documents
    - rerank-multilingual-v3.0: Multilingual support
    - rerank-english-v2.0: Previous generation
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "rerank-english-v3.0",
    ):
        self.api_key = api_key or getattr(settings, "COHERE_API_KEY", None)
        self.model = model
        self._client = None

    async def _get_client(self):
        """Get or create Cohere client."""
        if self._client is None:
            try:
                import cohere

                self._client = cohere.AsyncClient(self.api_key)
            except ImportError:
                logger.warning("Cohere package not installed. Install with: pip install cohere")
                raise
        return self._client

    async def rerank(
        self,
        query: str,
        documents: List[str],
        top_n: int = 10,
    ) -> List[Tuple[int, float]]:
        """
        Re-rank documents using Cohere Rerank.

        Args:
            query: Search query
            documents: List of document texts
            top_n: Number of top results to return

        Returns:
            List of (original_index, score) tuples sorted by relevance
        """
        if not self.api_key:
            logger.warning("Cohere API key not configured, skipping rerank")
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]

        try:
            client = await self._get_client()
            response = await client.rerank(
                model=self.model,
                query=query,
                documents=documents,
                top_n=top_n,
                return_documents=False,
            )

            return [(r.index, r.relevance_score) for r in response.results]

        except Exception as e:
            logger.error(f"Cohere rerank error: {e}")
            # Fallback to original order
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]


class OpenAIReranker:
    """
    Re-ranker using OpenAI embeddings for similarity scoring.

    This is a lightweight alternative that computes cosine similarity
    between query and document embeddings. Less accurate than
    cross-encoders but doesn't require additional API calls if
    embeddings are cached.
    """

    def __init__(
        self,
        model: str = "text-embedding-3-small",
    ):
        self.model = model

    async def _get_embedding(self, text: str) -> List[float]:
        """Get embedding for text."""
        import openai

        response = await openai.embeddings.create(
            model=self.model,
            input=text,
        )
        return response.data[0].embedding

    def _cosine_similarity(
        self,
        vec1: List[float],
        vec2: List[float],
    ) -> float:
        """Compute cosine similarity between two vectors."""
        import math

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    async def rerank(
        self,
        query: str,
        documents: List[str],
        top_n: int = 10,
    ) -> List[Tuple[int, float]]:
        """
        Re-rank using embedding similarity.

        Args:
            query: Search query
            documents: List of document texts
            top_n: Number of top results to return

        Returns:
            List of (original_index, score) tuples
        """
        try:
            # Get query embedding
            query_embedding = await self._get_embedding(query)

            # Get document embeddings (could batch this)
            scores = []
            for i, doc in enumerate(documents):
                doc_embedding = await self._get_embedding(doc[:8000])  # Truncate long docs
                similarity = self._cosine_similarity(query_embedding, doc_embedding)
                scores.append((i, similarity))

            # Sort by score
            scores.sort(key=lambda x: x[1], reverse=True)
            return scores[:top_n]

        except Exception as e:
            logger.error(f"OpenAI rerank error: {e}")
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]


class LLMReranker:
    """
    Re-ranker using LLM to score document relevance.

    Uses GPT-4 or similar to assess relevance on a scale.
    More expensive but can incorporate complex reasoning.
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
    ):
        self.model = model

    async def rerank(
        self,
        query: str,
        documents: List[str],
        top_n: int = 10,
    ) -> List[Tuple[int, float]]:
        """
        Re-rank using LLM scoring.

        Args:
            query: Search query
            documents: List of document texts
            top_n: Number of top results to return

        Returns:
            List of (original_index, score) tuples
        """
        client = get_async_openai_client()
        scores = []

        for i, doc in enumerate(documents[:20]):  # Limit to first 20 for cost
            try:
                prompt = f"""Rate the relevance of this document to the query on a scale of 0-10.
Only respond with a number.

Query: {query}

Document: {doc[:2000]}

Relevance score (0-10):"""

                response = await client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=5,
                    temperature=0,
                )

                score_text = response.choices[0].message.content.strip()
                score = float(score_text) / 10.0  # Normalize to 0-1
                scores.append((i, min(1.0, max(0.0, score))))

            except Exception as e:
                logger.error(f"LLM scoring error for doc {i}: {e}")
                scores.append((i, 0.5))  # Default score

        # Sort by score
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_n]


class CrossEncoderReranker:
    """
    Re-ranker using local cross-encoder model.

    Uses sentence-transformers cross-encoder models for scoring.
    Requires GPU for efficient inference.

    Models:
    - cross-encoder/ms-marco-MiniLM-L-6-v2: Fast, general purpose
    - cross-encoder/ms-marco-MiniLM-L-12-v2: More accurate
    - cross-encoder/ms-marco-TinyBERT-L-2-v2: Fastest, less accurate
    """

    def __init__(
        self,
        model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        device: str = "cpu",
    ):
        self.model_name = model_name
        self.device = device
        self._model = None

    async def _get_model(self):
        """Load cross-encoder model lazily."""
        if self._model is None:
            try:
                from sentence_transformers import CrossEncoder

                self._model = CrossEncoder(self.model_name, device=self.device)
            except ImportError:
                logger.warning(
                    "sentence-transformers not installed. " "Install with: pip install sentence-transformers"
                )
                raise
        return self._model

    async def rerank(
        self,
        query: str,
        documents: List[str],
        top_n: int = 10,
    ) -> List[Tuple[int, float]]:
        """
        Re-rank using cross-encoder.

        Args:
            query: Search query
            documents: List of document texts
            top_n: Number of top results to return

        Returns:
            List of (original_index, score) tuples
        """
        try:
            model = await self._get_model()

            # Create query-document pairs
            pairs = [[query, doc] for doc in documents]

            # Score all pairs (run in thread to avoid blocking)
            scores = await asyncio.to_thread(model.predict, pairs)

            # Normalize scores to 0-1 using sigmoid
            import math

            normalized_scores = [1 / (1 + math.exp(-s)) for s in scores]

            # Create (index, score) tuples and sort
            indexed_scores = list(enumerate(normalized_scores))
            indexed_scores.sort(key=lambda x: x[1], reverse=True)

            return indexed_scores[:top_n]

        except Exception as e:
            logger.error(f"Cross-encoder rerank error: {e}")
            return [(i, 1.0) for i in range(min(top_n, len(documents)))]


class RerankingService:
    """
    Main re-ranking service that orchestrates different re-rankers.

    Provides a unified interface for re-ranking search results
    with caching and fallback handling.
    """

    def __init__(
        self,
        config: Optional[RerankerConfig] = None,
    ):
        self.config = config or RerankerConfig()

        # Initialize re-rankers based on config
        self._rerankers: Dict[RerankerType, Any] = {}

        if self.config.reranker_type == RerankerType.COHERE:
            self._rerankers[RerankerType.COHERE] = CohereReranker(model=self.config.model)
        elif self.config.reranker_type == RerankerType.OPENAI:
            self._rerankers[RerankerType.OPENAI] = OpenAIReranker()
        elif self.config.reranker_type == RerankerType.CROSS_ENCODER:
            self._rerankers[RerankerType.CROSS_ENCODER] = CrossEncoderReranker()
        elif self.config.reranker_type == RerankerType.LLM_BASED:
            self._rerankers[RerankerType.LLM_BASED] = LLMReranker()

    async def rerank(
        self,
        query: str,
        results: List[Dict[str, Any]],
        content_key: str = "content",
    ) -> List[RerankedResult]:
        """
        Re-rank search results.

        Args:
            query: Original search query
            results: List of search results with content
            content_key: Key to extract content from results

        Returns:
            Re-ranked results with scores
        """
        if not results:
            return []

        if self.config.reranker_type == RerankerType.NONE:
            # No re-ranking - return original results
            return [
                RerankedResult(
                    chunk_id=r.get("chunk_id", str(i)),
                    document_id=r.get("document_id", "unknown"),
                    content=r.get(content_key, ""),
                    original_score=r.get("score", 0.0),
                    rerank_score=r.get("score", 0.0),
                    final_score=r.get("score", 0.0),
                    metadata=r.get("metadata", {}),
                )
                for i, r in enumerate(results)
            ]

        # Check cache
        cache_key = generate_cache_key(
            "rerank",
            query,
            len(results),
            self.config.reranker_type.value,
        )
        cached = await cache_service.get(cache_key)
        if cached is not None:
            logger.debug("Using cached rerank results")
            return [RerankedResult(**r) for r in cached]

        # Extract documents for re-ranking
        documents = [r.get(content_key, "") for r in results]

        # Get reranker
        reranker = self._rerankers.get(self.config.reranker_type)
        if not reranker:
            logger.warning(f"Reranker {self.config.reranker_type} not initialized")
            return self._create_results_without_reranking(results, content_key)

        try:
            # Perform re-ranking
            rerank_scores = await reranker.rerank(
                query=query,
                documents=documents,
                top_n=self.config.top_n,
            )

            # Build reranked results
            reranked = []
            for original_idx, rerank_score in rerank_scores:
                if original_idx >= len(results):
                    continue

                r = results[original_idx]
                original_score = r.get("score", 0.0)

                # Combine scores
                final_score = self.config.score_weight * rerank_score + (1 - self.config.score_weight) * original_score

                if final_score < self.config.min_relevance_score:
                    continue

                reranked.append(
                    RerankedResult(
                        chunk_id=r.get("chunk_id", str(original_idx)),
                        document_id=r.get("document_id", "unknown"),
                        content=r.get(content_key, ""),
                        original_score=original_score,
                        rerank_score=rerank_score,
                        final_score=final_score,
                        metadata=r.get("metadata", {}),
                    )
                )

            # Sort by final score
            reranked.sort(key=lambda x: x.final_score, reverse=True)

            # Cache results
            await cache_service.set(
                cache_key,
                [
                    {
                        "chunk_id": r.chunk_id,
                        "document_id": r.document_id,
                        "content": r.content,
                        "original_score": r.original_score,
                        "rerank_score": r.rerank_score,
                        "final_score": r.final_score,
                        "metadata": r.metadata,
                    }
                    for r in reranked
                ],
                ttl=self.config.cache_ttl,
            )

            return reranked

        except Exception as e:
            logger.error(f"Re-ranking failed: {e}", exc_info=True)
            return self._create_results_without_reranking(results, content_key)

    def _create_results_without_reranking(
        self,
        results: List[Dict[str, Any]],
        content_key: str,
    ) -> List[RerankedResult]:
        """Create results without re-ranking (fallback)."""
        return [
            RerankedResult(
                chunk_id=r.get("chunk_id", str(i)),
                document_id=r.get("document_id", "unknown"),
                content=r.get(content_key, ""),
                original_score=r.get("score", 0.0),
                rerank_score=r.get("score", 0.0),
                final_score=r.get("score", 0.0),
                metadata=r.get("metadata", {}),
            )
            for i, r in enumerate(results[: self.config.top_n])
        ]

    async def rerank_with_diversity(
        self,
        query: str,
        results: List[Dict[str, Any]],
        content_key: str = "content",
        diversity_threshold: float = 0.8,
    ) -> List[RerankedResult]:
        """
        Re-rank with diversity - avoid returning too similar documents.

        Uses Maximal Marginal Relevance (MMR) style diversity.
        """
        # First, get standard reranked results
        reranked = await self.rerank(query, results, content_key)

        if len(reranked) <= 1:
            return reranked

        # Apply diversity filter
        selected = [reranked[0]]
        candidates = reranked[1:]

        while candidates and len(selected) < self.config.top_n:
            best_candidate = None
            best_score = -float("inf")

            for candidate in candidates:
                # Check similarity to already selected
                max_similarity = 0.0
                for selected_doc in selected:
                    similarity = self._text_similarity(candidate.content, selected_doc.content)
                    max_similarity = max(max_similarity, similarity)

                # MMR-style score: relevance - lambda * max_similarity
                mmr_score = candidate.final_score - diversity_threshold * max_similarity

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_candidate = candidate

            if best_candidate:
                selected.append(best_candidate)
                candidates.remove(best_candidate)
            else:
                break

        return selected

    def _text_similarity(self, text1: str, text2: str) -> float:
        """Simple text similarity using Jaccard index."""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())

        if not words1 or not words2:
            return 0.0

        intersection = len(words1 & words2)
        union = len(words1 | words2)

        return intersection / union if union > 0 else 0.0
