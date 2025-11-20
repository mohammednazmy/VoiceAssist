"""Search aggregator stub.

This service will eventually coordinate semantic search over Qdrant,
lexical search, and filtering according to SEMANTIC_SEARCH_DESIGN.md.
"""
from __future__ import annotations

from typing import Any, Dict, List
from pydantic import BaseModel


class SearchResult(BaseModel):
    doc_id: str
    score: float
    snippet: str
    metadata: Dict[str, Any]


async def hybrid_search(query: str, *, limit: int = 10) -> List[SearchResult]:
    """Stubbed hybrid search.

    Later phases will:
    - embed query
    - query vector DB (Qdrant)
    - combine with lexical search
    - apply domain filters
    """
    return []
