"""
Hybrid Search Service (Phase 5 - Advanced RAG)

Combines multiple search strategies for improved retrieval:
1. Dense Vector Search (Qdrant) - Semantic similarity
2. Sparse Vector Search (BM25) - Keyword matching
3. Hybrid Fusion - Reciprocal Rank Fusion (RRF)

Features:
- Configurable fusion weights
- Score normalization
- Query-dependent strategy selection
- Async execution with parallel search
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import openai
from app.core.config import settings
from app.services.cache_service import cache_service, generate_cache_key
from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

logger = logging.getLogger(__name__)


class SearchStrategy(str, Enum):
    """Search strategy options."""

    VECTOR_ONLY = "vector_only"
    BM25_ONLY = "bm25_only"
    HYBRID = "hybrid"
    AUTO = "auto"  # Automatically select based on query


@dataclass
class SearchResult:
    """Unified search result from any search method."""

    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)
    source: str = "unknown"  # vector, bm25, hybrid


@dataclass
class HybridSearchConfig:
    """Configuration for hybrid search."""

    vector_weight: float = 0.6  # Weight for vector search
    bm25_weight: float = 0.4  # Weight for BM25 search
    rrf_k: int = 60  # RRF constant (higher = more weight to lower ranks)
    normalize_scores: bool = True
    min_score_threshold: float = 0.1
    max_results: int = 20


class BM25Index:
    """
    Simple BM25 index for keyword search.

    In production, this would typically be backed by Elasticsearch
    or Meilisearch. This implementation uses an in-memory index for MVP.
    """

    def __init__(
        self,
        k1: float = 1.5,  # Term frequency saturation
        b: float = 0.75,  # Length normalization
    ):
        self.k1 = k1
        self.b = b
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.doc_lengths: Dict[str, int] = {}
        self.avg_doc_length: float = 0.0
        self.term_doc_freqs: Dict[str, int] = {}
        self.inverted_index: Dict[str, Dict[str, float]] = {}
        self._initialized = False

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization - lowercase and split on non-alphanumeric."""
        text = text.lower()
        tokens = re.findall(r"\b[a-z0-9]+\b", text)
        return tokens

    def _compute_tf(self, term: str, doc_tokens: List[str]) -> float:
        """Compute term frequency."""
        return doc_tokens.count(term)

    def add_document(
        self,
        doc_id: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Add document to the index."""
        tokens = self._tokenize(content)
        self.documents[doc_id] = {
            "content": content,
            "tokens": tokens,
            "metadata": metadata or {},
        }
        self.doc_lengths[doc_id] = len(tokens)

        # Update inverted index
        unique_terms = set(tokens)
        for term in unique_terms:
            if term not in self.inverted_index:
                self.inverted_index[term] = {}
                self.term_doc_freqs[term] = 0
            self.term_doc_freqs[term] += 1
            self.inverted_index[term][doc_id] = self._compute_tf(term, tokens)

        # Update average document length
        total_length = sum(self.doc_lengths.values())
        self.avg_doc_length = total_length / len(self.doc_lengths) if self.doc_lengths else 0
        self._initialized = True

    def search(
        self,
        query: str,
        top_k: int = 10,
    ) -> List[Tuple[str, float]]:
        """
        Search the index using BM25.

        Returns list of (doc_id, score) tuples.
        """
        if not self._initialized:
            return []

        query_tokens = self._tokenize(query)
        scores: Dict[str, float] = {}
        n_docs = len(self.documents)

        for term in query_tokens:
            if term not in self.inverted_index:
                continue

            # IDF component
            df = self.term_doc_freqs[term]
            idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1)

            # Score each document containing this term
            for doc_id, tf in self.inverted_index[term].items():
                doc_len = self.doc_lengths[doc_id]

                # BM25 formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * (doc_len / self.avg_doc_length))
                term_score = idf * (numerator / denominator)

                scores[doc_id] = scores.get(doc_id, 0.0) + term_score

        # Sort by score and return top_k
        sorted_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_results[:top_k]

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Get document by ID."""
        return self.documents.get(doc_id)


class HybridSearchService:
    """
    Hybrid search combining vector and BM25 search.

    Uses Reciprocal Rank Fusion (RRF) to combine results from
    multiple search strategies.
    """

    def __init__(
        self,
        qdrant_url: str = "http://qdrant:6333",
        collection_name: str = "medical_kb",
        embedding_model: str = "text-embedding-3-small",
        config: Optional[HybridSearchConfig] = None,
    ):
        self.qdrant_url = qdrant_url
        self.collection_name = collection_name
        self.embedding_model = embedding_model
        self.config = config or HybridSearchConfig()

        # Initialize BM25 index (in-memory for MVP)
        self.bm25_index = BM25Index()

        # Check if Qdrant is enabled
        self.qdrant_enabled = getattr(settings, "QDRANT_ENABLED", True)
        self.qdrant_client = None

        if self.qdrant_enabled:
            try:
                from qdrant_client import QdrantClient

                self.qdrant_client = QdrantClient(url=qdrant_url, timeout=5.0)
            except Exception as e:
                logger.warning(f"Failed to initialize Qdrant client: {e}")
                self.qdrant_enabled = False

    async def initialize_bm25_index(self, documents: List[Dict[str, Any]]) -> int:
        """
        Initialize BM25 index with documents.

        Args:
            documents: List of dicts with 'id', 'content', 'metadata' keys

        Returns:
            Number of documents indexed
        """
        count = 0
        for doc in documents:
            self.bm25_index.add_document(
                doc_id=doc["id"],
                content=doc["content"],
                metadata=doc.get("metadata", {}),
            )
            count += 1

        logger.info(f"Initialized BM25 index with {count} documents")
        return count

    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI."""
        cache_key = generate_cache_key("hybrid_embedding", text, model=self.embedding_model)
        cached = await cache_service.get(cache_key)
        if cached is not None:
            return cached

        try:
            response = await asyncio.wait_for(
                openai.embeddings.create(model=self.embedding_model, input=text),
                timeout=15,
            )
            embedding = response.data[0].embedding
            await cache_service.set(cache_key, embedding, ttl=86400)
            return embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def _build_filter(self, filters: Optional[Dict[str, Any]]) -> Optional[Filter]:
        """Convert simple dict filters into a Qdrant filter."""

        if not filters:
            return None

        must: List[FieldCondition] = []
        for key, value in filters.items():
            if isinstance(value, (list, tuple, set)):
                must.append(FieldCondition(key=key, match=MatchAny(any=list(value))))
            else:
                must.append(FieldCondition(key=key, match=MatchValue(value=value)))

        return Filter(must=must)

    def _metadata_matches_filters(self, metadata: Dict[str, Any], filters: Optional[Dict[str, Any]]) -> bool:
        """Check if metadata satisfies filter conditions."""

        if not filters:
            return True

        for key, expected in filters.items():
            if isinstance(expected, (list, tuple, set)):
                if metadata.get(key) not in expected:
                    return False
            else:
                if metadata.get(key) != expected:
                    return False
        return True

    async def _vector_search(
        self,
        query: str,
        top_k: int,
        score_threshold: float = 0.0,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """Perform vector search using Qdrant."""
        if not self.qdrant_enabled or not self.qdrant_client:
            return []

        try:
            query_embedding = await self._generate_embedding(query)

            # Execute Qdrant search in thread pool
            # Note: qdrant-client v1.6+ uses query_points instead of search
            search_filter = self._build_filter(filters)
            query_response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.qdrant_client.query_points,
                    collection_name=self.collection_name,
                    query=query_embedding,
                    limit=top_k,
                    score_threshold=score_threshold,
                    query_filter=search_filter,
                ),
                timeout=5,
            )

            # Extract points from QueryResponse
            results = query_response.points if hasattr(query_response, "points") else []

            search_results = []
            for result in results:
                search_results.append(
                    SearchResult(
                        chunk_id=str(result.id),
                        document_id=result.payload.get("document_id", "unknown"),
                        content=result.payload.get("content", ""),
                        score=result.score,
                        metadata={
                            "title": result.payload.get("title", ""),
                            "source_type": result.payload.get("source_type", ""),
                            **{
                                k: v
                                for k, v in result.payload.items()
                                if k
                                not in [
                                    "content",
                                    "document_id",
                                    "title",
                                    "source_type",
                                ]
                            },
                        },
                        source="vector",
                    )
                )

            return search_results

        except Exception as e:
            logger.error(f"Vector search error: {e}")
            return []

    async def _bm25_search(
        self,
        query: str,
        top_k: int,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """Perform BM25 keyword search."""
        try:
            results = self.bm25_index.search(query, top_k=top_k)

            search_results = []
            for doc_id, score in results:
                doc = self.bm25_index.get_document(doc_id)
                if doc and self._metadata_matches_filters(doc.get("metadata", {}), filters):
                    search_results.append(
                        SearchResult(
                            chunk_id=doc_id,
                            document_id=doc["metadata"].get("document_id", doc_id),
                            content=doc["content"],
                            score=score,
                            metadata=doc["metadata"],
                            source="bm25",
                        )
                    )

            return search_results

        except Exception as e:
            logger.error(f"BM25 search error: {e}")
            return []

    def _normalize_scores(
        self,
        results: List[SearchResult],
    ) -> List[SearchResult]:
        """Normalize scores to 0-1 range."""
        if not results:
            return results

        scores = [r.score for r in results]
        min_score = min(scores)
        max_score = max(scores)

        if max_score == min_score:
            for r in results:
                r.score = 1.0
        else:
            for r in results:
                r.score = (r.score - min_score) / (max_score - min_score)

        return results

    def _reciprocal_rank_fusion(
        self,
        result_lists: List[List[SearchResult]],
        k: int = 60,
    ) -> List[SearchResult]:
        """
        Combine multiple result lists using Reciprocal Rank Fusion.

        RRF score = sum(1 / (k + rank_i)) for each list

        Args:
            result_lists: List of result lists from different search methods
            k: RRF constant (default 60)

        Returns:
            Combined and re-ranked results
        """
        # Calculate RRF scores
        rrf_scores: Dict[str, float] = {}
        result_lookup: Dict[str, SearchResult] = {}

        for results in result_lists:
            for rank, result in enumerate(results, start=1):
                rrf_score = 1.0 / (k + rank)
                rrf_scores[result.chunk_id] = rrf_scores.get(result.chunk_id, 0.0) + rrf_score
                # Keep the result with highest original score
                if result.chunk_id not in result_lookup or result.score > result_lookup[result.chunk_id].score:
                    result_lookup[result.chunk_id] = result

        # Create final results with RRF scores
        final_results = []
        for chunk_id, rrf_score in sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True):
            result = result_lookup[chunk_id]
            # Update score to RRF score
            result.score = rrf_score
            result.source = "hybrid"
            final_results.append(result)

        return final_results

    def _weighted_fusion(
        self,
        vector_results: List[SearchResult],
        bm25_results: List[SearchResult],
    ) -> List[SearchResult]:
        """
        Combine results using weighted score fusion.

        Args:
            vector_results: Results from vector search
            bm25_results: Results from BM25 search

        Returns:
            Combined results with weighted scores
        """
        # Normalize scores if configured
        if self.config.normalize_scores:
            vector_results = self._normalize_scores(vector_results)
            bm25_results = self._normalize_scores(bm25_results)

        # Combine scores
        combined_scores: Dict[str, float] = {}
        result_lookup: Dict[str, SearchResult] = {}

        for result in vector_results:
            combined_scores[result.chunk_id] = result.score * self.config.vector_weight
            result_lookup[result.chunk_id] = result

        for result in bm25_results:
            if result.chunk_id in combined_scores:
                combined_scores[result.chunk_id] += result.score * self.config.bm25_weight
            else:
                combined_scores[result.chunk_id] = result.score * self.config.bm25_weight
                result_lookup[result.chunk_id] = result

        # Create final results
        final_results = []
        for chunk_id, score in sorted(combined_scores.items(), key=lambda x: x[1], reverse=True):
            result = result_lookup[chunk_id]
            result.score = score
            result.source = "hybrid"
            final_results.append(result)

        return final_results

    def _select_strategy(self, query: str) -> SearchStrategy:
        """
        Automatically select search strategy based on query characteristics.

        - Short queries with specific terms -> BM25 might be better
        - Long, semantic queries -> Vector search might be better
        - Mixed queries -> Hybrid
        """
        tokens = query.lower().split()

        # Very short queries (1-2 words) - use hybrid with BM25 emphasis
        if len(tokens) <= 2:
            return SearchStrategy.HYBRID

        # Queries with medical terms (acronyms, specific terms)
        medical_indicators = [
            "mg",
            "ml",
            "mmhg",
            "bpm",
            "gfr",
            "hba1c",
            "ldl",
            "hdl",
            "icd",
            "cpt",
            "icd-10",
            "snomed",
            "rxnorm",
        ]
        has_medical_terms = any(indicator in query.lower() for indicator in medical_indicators)

        if has_medical_terms:
            return SearchStrategy.HYBRID

        # Question queries - vector search is usually better
        question_words = ["what", "how", "why", "when", "where", "which", "explain"]
        is_question = any(query.lower().startswith(q) for q in question_words)

        if is_question and len(tokens) > 5:
            return SearchStrategy.VECTOR_ONLY

        return SearchStrategy.HYBRID

    async def search(
        self,
        query: str,
        top_k: int = 10,
        strategy: SearchStrategy = SearchStrategy.AUTO,
        score_threshold: Optional[float] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """
        Perform hybrid search.

        Args:
            query: Search query
            top_k: Number of results to return
            strategy: Search strategy to use
            score_threshold: Minimum score threshold

        Returns:
            List of search results
        """
        threshold = score_threshold or self.config.min_score_threshold

        # Auto-select strategy if requested
        if strategy == SearchStrategy.AUTO:
            strategy = self._select_strategy(query)
            logger.debug(f"Auto-selected search strategy: {strategy}")

        # Execute search based on strategy
        if strategy == SearchStrategy.VECTOR_ONLY:
            results = await self._vector_search(query, top_k, threshold, filters)

        elif strategy == SearchStrategy.BM25_ONLY:
            results = await self._bm25_search(query, top_k, filters)
            results = [r for r in results if r.score >= threshold]

        elif strategy == SearchStrategy.HYBRID:
            # Execute both searches in parallel
            vector_task = self._vector_search(query, top_k * 2, 0.0, filters)
            bm25_task = self._bm25_search(query, top_k * 2, filters)

            vector_results, bm25_results = await asyncio.gather(vector_task, bm25_task)

            # Use RRF for fusion
            results = self._reciprocal_rank_fusion(
                [vector_results, bm25_results],
                k=self.config.rrf_k,
            )

            # Apply threshold filter
            results = [r for r in results if r.score >= threshold]

        else:
            results = []

        # Limit to top_k
        return results[:top_k]

    async def search_with_expansion(
        self,
        query: str,
        top_k: int = 10,
        expand_query: bool = True,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[SearchResult]:
        """
        Search with optional query expansion.

        Query expansion adds related terms to improve recall.
        """
        queries = [query]

        if expand_query:
            # Simple query expansion using synonyms/related terms
            # In production, this would use a medical thesaurus or LLM
            expanded = await self._expand_query(query)
            if expanded:
                queries.append(expanded)

        # Search with all queries and merge results
        all_results = []
        for q in queries:
            results = await self.search(q, top_k=top_k, filters=filters)
            all_results.append(results)

        if len(all_results) == 1:
            return all_results[0]

        # Merge using RRF
        return self._reciprocal_rank_fusion(all_results)[:top_k]

    async def _expand_query(self, query: str) -> Optional[str]:
        """
        Expand query with related terms.

        Uses simple heuristics for MVP. Could be enhanced with:
        - Medical thesaurus (UMLS)
        - LLM-based expansion
        - Query reformulation
        """
        # Medical abbreviation expansions
        expansions = {
            "mi": "myocardial infarction heart attack",
            "cad": "coronary artery disease",
            "chf": "congestive heart failure",
            "copd": "chronic obstructive pulmonary disease",
            "dm": "diabetes mellitus",
            "htn": "hypertension high blood pressure",
            "ckd": "chronic kidney disease",
            "afib": "atrial fibrillation",
            "pe": "pulmonary embolism",
            "dvt": "deep vein thrombosis",
            "uti": "urinary tract infection",
            "cva": "cerebrovascular accident stroke",
            "tia": "transient ischemic attack",
            "gerd": "gastroesophageal reflux disease",
            "ra": "rheumatoid arthritis",
            "oa": "osteoarthritis",
            "nsaid": "non-steroidal anti-inflammatory drug",
            "ace": "angiotensin converting enzyme inhibitor",
            "arb": "angiotensin receptor blocker",
            "ssri": "selective serotonin reuptake inhibitor",
        }

        query_lower = query.lower()
        expanded_terms = []

        for abbrev, expansion in expansions.items():
            if abbrev in query_lower.split():
                expanded_terms.append(expansion)

        if expanded_terms:
            return query + " " + " ".join(expanded_terms)

        return None
