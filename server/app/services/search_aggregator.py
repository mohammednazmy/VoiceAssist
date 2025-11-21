"""
Search Aggregator Service (Phase 5 MVP, monorepo mirror)

Performs semantic search across the knowledge base using Qdrant vector database.
Returns relevant document chunks with scores and metadata for RAG.

MVP Implementation:
- Vector similarity search using Qdrant
- Configurable top-K results
- Score-based filtering
- Result formatting for RAG

Future enhancements:
- Multi-vector search (dense + sparse)
- Hybrid search (vector + keyword)
- Query expansion
- Result re-ranking
"""
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import logging

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
import openai

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Represents a search result from the knowledge base."""
    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: Dict[str, Any]


class SearchAggregator:
    """
    Search Aggregator for semantic search across medical knowledge base.

    Handles query embedding generation and vector search in Qdrant.
    """

    def __init__(
        self,
        qdrant_url: str = "http://qdrant:6333",
        collection_name: str = "medical_kb",
        embedding_model: str = "text-embedding-3-small"
    ):
        """
        Initialize Search Aggregator.

        Args:
            qdrant_url: Qdrant server URL
            collection_name: Name of the collection to search
            embedding_model: OpenAI embedding model to use
        """
        self.qdrant_client = QdrantClient(url=qdrant_url)
        self.collection_name = collection_name
        self.embedding_model = embedding_model

    async def generate_query_embedding(self, query: str) -> List[float]:
        """
        Generate embedding vector for search query.

        Args:
            query: Search query text

        Returns:
            Query embedding vector
        """
        try:
            response = await openai.embeddings.create(
                model=self.embedding_model,
                input=query
            )
            embedding = response.data[0].embedding
            return embedding

        except Exception as e:
            logger.error(f"Error generating query embedding: {e}", exc_info=True)
            raise

    async def search(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.7,
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        """
        Perform semantic search against the knowledge base.

        Args:
            query: Search query text
            top_k: Number of top results to return
            score_threshold: Minimum similarity score (0-1)
            filter_conditions: Optional filters (e.g., source_type, document_id)

        Returns:
            List of search results sorted by relevance
        """
        try:
            # Generate query embedding
            query_embedding = await self.generate_query_embedding(query)

            # Prepare filter if specified
            search_filter = None
            if filter_conditions:
                filter_must = []
                for key, value in filter_conditions.items():
                    filter_must.append(
                        FieldCondition(
                            key=key,
                            match=MatchValue(value=value)
                        )
                    )
                search_filter = Filter(must=filter_must)

            # Perform vector search in Qdrant
            search_results = self.qdrant_client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                limit=top_k,
                score_threshold=score_threshold,
                query_filter=search_filter
            )

            # Format results
            results = []
            for result in search_results:
                search_result = SearchResult(
                    chunk_id=str(result.id),
                    document_id=result.payload.get("document_id", "unknown"),
                    content=result.payload.get("content", ""),
                    score=result.score,
                    metadata={
                        "title": result.payload.get("title", "Untitled"),
                        "source_type": result.payload.get("source_type", "unknown"),
                        "chunk_index": result.payload.get("chunk_index", 0),
                        **{k: v for k, v in result.payload.items()
                           if k not in ["content", "document_id", "title", "source_type", "chunk_index"]}
                    }
                )
                results.append(search_result)

            logger.info(f"Found {len(results)} results for query (top_k={top_k}, threshold={score_threshold})")
            return results

        except Exception as e:
            logger.error(f"Error performing search: {e}", exc_info=True)
            return []

    async def search_by_document_id(
        self,
        document_id: str,
        top_k: int = 10
    ) -> List[SearchResult]:
        """
        Retrieve all chunks for a specific document.

        Args:
            document_id: Document identifier
            top_k: Maximum number of chunks to return

        Returns:
            List of document chunks
        """
        try:
            # Search with document_id filter
            search_results = self.qdrant_client.scroll(
                collection_name=self.collection_name,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=document_id)
                        )
                    ]
                ),
                limit=top_k
            )

            # Format results
            results = []
            for result in search_results[0]:  # scroll returns (points, next_page_offset)
                search_result = SearchResult(
                    chunk_id=str(result.id),
                    document_id=result.payload.get("document_id", "unknown"),
                    content=result.payload.get("content", ""),
                    score=1.0,  # Not a similarity search
                    metadata={
                        "title": result.payload.get("title", "Untitled"),
                        "source_type": result.payload.get("source_type", "unknown"),
                        "chunk_index": result.payload.get("chunk_index", 0),
                        **{k: v for k, v in result.payload.items()
                           if k not in ["content", "document_id", "title", "source_type", "chunk_index"]}
                    }
                )
                results.append(search_result)

            logger.info(f"Retrieved {len(results)} chunks for document {document_id}")
            return results

        except Exception as e:
            logger.error(f"Error retrieving document chunks: {e}", exc_info=True)
            return []

    def format_context_for_rag(self, search_results: List[SearchResult]) -> str:
        """
        Format search results into context string for RAG.

        Args:
            search_results: List of search results

        Returns:
            Formatted context string
        """
        if not search_results:
            return ""

        context_parts = []
        for i, result in enumerate(search_results, 1):
            context_parts.append(
                f"[Source {i}] {result.metadata.get('title', 'Unknown')} "
                f"(Score: {result.score:.2f})\n{result.content}\n"
            )

        return "\n".join(context_parts)

    def extract_citations(self, search_results: List[SearchResult]) -> List[Dict[str, Any]]:
        """
        Extract citation information from search results.

        Args:
            search_results: List of search results

        Returns:
            List of citation dictionaries
        """
        citations = []
        seen_documents = set()

        for result in search_results:
            # Only include each document once
            if result.document_id in seen_documents:
                continue

            seen_documents.add(result.document_id)

            citation = {
                "id": result.document_id,
                "source_type": result.metadata.get("source_type", "unknown"),
                "title": result.metadata.get("title", "Untitled"),
                "url": result.metadata.get("url"),
                "relevance_score": result.score
            }
            citations.append(citation)

        return citations
