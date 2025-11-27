"""
Multi-Hop Reasoning Service

Provides advanced RAG capabilities with multi-step reasoning:
- Query decomposition into sub-questions
- Iterative retrieval and answer generation
- Chain-of-thought reasoning synthesis
- Confidence scoring for medical queries

This service enables the AI assistant to answer complex medical
questions that require combining information from multiple sources.
"""

import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class ReasoningStrategy(Enum):
    """Reasoning strategies for different query types"""

    DIRECT = "direct"  # Single-step retrieval and answer
    MULTI_HOP = "multi_hop"  # Iterative sub-question answering
    COMPARATIVE = "comparative"  # Compare multiple entities
    CAUSAL = "causal"  # Explain cause-effect relationships
    TEMPORAL = "temporal"  # Time-based reasoning


@dataclass
class SearchResult:
    """Result from hybrid search"""

    doc_id: str
    content: str
    score: float
    metadata: Dict[str, Any]
    source: str  # 'semantic', 'keyword', 'hybrid'


@dataclass
class ReasoningStep:
    """A single step in the reasoning chain"""

    step_number: int
    question: str
    retrieved_docs: List[str]
    answer: str
    confidence: float
    sources: List[str]


@dataclass
class ReasoningResult:
    """Complete result of multi-hop reasoning"""

    original_query: str
    strategy: ReasoningStrategy
    reasoning_chain: List[ReasoningStep]
    final_answer: str
    confidence: float
    sources: List[str]
    metadata: Dict[str, Any] = field(default_factory=dict)


class HybridSearchEngine:
    """
    Hybrid search engine combining semantic and keyword search.

    Features:
    - Vector similarity search using embeddings
    - BM25 keyword search for lexical matching
    - Reciprocal Rank Fusion for result combination
    - Cross-encoder re-ranking for improved relevance
    - Medical synonym expansion
    """

    def __init__(self, lazy_load: bool = True):
        """
        Initialize hybrid search engine.

        Args:
            lazy_load: If True, load models on first use
        """
        self._embedding_service = None
        self._reranker = None
        self._bm25_index = None
        self._lazy_load = lazy_load
        self._loaded = False

        if not lazy_load:
            self._load_components()

    def _load_components(self) -> bool:
        """Load search components."""
        if self._loaded:
            return True

        try:
            # Try to import embedding service
            from app.services.medical_embedding_service import MedicalEmbeddingService

            self._embedding_service = MedicalEmbeddingService(lazy_load=True)
            self._loaded = True
            logger.info("HybridSearchEngine components loaded")
            return True

        except ImportError as e:
            logger.warning(f"Could not load search components: {e}")
            return False

    def _ensure_loaded(self) -> bool:
        """Ensure components are loaded."""
        if self._loaded:
            return True
        return self._load_components()

    async def search(
        self,
        query: str,
        top_k: int = 10,
        alpha: float = 0.5,
        filters: Optional[Dict[str, Any]] = None,
        rerank: bool = True,
        expand_query: bool = True,
    ) -> List[SearchResult]:
        """
        Perform hybrid search combining semantic and keyword search.

        Args:
            query: Search query
            top_k: Number of results to return
            alpha: Balance between semantic (1.0) and keyword (0.0)
            filters: Metadata filters
            rerank: Whether to apply cross-encoder re-ranking
            expand_query: Whether to expand query with synonyms

        Returns:
            List of SearchResult objects
        """
        if not self._ensure_loaded():
            return []

        # Expand query with medical synonyms
        expanded_query = query
        if expand_query:
            expanded_query = await self._expand_query(query)

        # Run semantic and keyword search in parallel
        semantic_task = self._semantic_search(expanded_query, top_k * 2, filters)
        keyword_task = self._keyword_search(expanded_query, top_k * 2, filters)

        semantic_results, keyword_results = await asyncio.gather(semantic_task, keyword_task)

        # Fuse results using Reciprocal Rank Fusion
        fused_results = self._reciprocal_rank_fusion(semantic_results, keyword_results, alpha=alpha)

        # Re-rank with cross-encoder if available
        if rerank and fused_results:
            fused_results = await self._rerank_results(query, fused_results, top_k)

        return fused_results[:top_k]

    async def _expand_query(self, query: str) -> str:
        """
        Expand query with medical synonyms and related terms.

        Args:
            query: Original query

        Returns:
            Expanded query string
        """
        # Medical synonym mappings (subset for common terms)
        synonyms = {
            "heart attack": ["myocardial infarction", "MI", "cardiac infarction"],
            "stroke": ["cerebrovascular accident", "CVA", "brain attack"],
            "high blood pressure": ["hypertension", "HTN", "elevated BP"],
            "diabetes": ["diabetes mellitus", "DM", "hyperglycemia"],
            "cancer": ["malignancy", "neoplasm", "carcinoma"],
            "pain": ["discomfort", "ache", "soreness"],
            "infection": ["sepsis", "infectious disease"],
            "breathing": ["respiration", "respiratory"],
            "kidney": ["renal", "nephro"],
            "liver": ["hepatic", "hepato"],
            "brain": ["cerebral", "neuro", "cranial"],
            "heart": ["cardiac", "cardio", "cardiovascular"],
            "stomach": ["gastric", "gastro", "abdominal"],
            "lung": ["pulmonary", "respiratory"],
            "blood": ["hematologic", "hemo"],
        }

        # Find and add synonyms
        query_lower = query.lower()
        additional_terms = []

        for term, syns in synonyms.items():
            if term in query_lower:
                additional_terms.extend(syns[:2])  # Add up to 2 synonyms

        if additional_terms:
            return f"{query} {' '.join(additional_terms)}"

        return query

    async def _semantic_search(
        self,
        query: str,
        top_k: int,
        filters: Optional[Dict[str, Any]],
    ) -> List[SearchResult]:
        """
        Vector similarity search using embeddings.

        Args:
            query: Search query
            top_k: Number of results
            filters: Optional filters

        Returns:
            List of SearchResult
        """
        results = []

        try:
            # Generate query embedding
            if self._embedding_service:
                embedding_result = await self._embedding_service.generate_embedding(query)
                query_embedding = embedding_result.embedding

                # In production, this would query Qdrant/Pinecone
                # For now, return empty results - will be implemented with vector DB
                logger.debug(f"Semantic search for query (embedding dim: {len(query_embedding)})")

        except Exception as e:
            logger.warning(f"Semantic search failed: {e}")

        return results

    async def _keyword_search(
        self,
        query: str,
        top_k: int,
        filters: Optional[Dict[str, Any]],
    ) -> List[SearchResult]:
        """
        BM25 keyword search for lexical matching.

        Args:
            query: Search query
            top_k: Number of results
            filters: Optional filters

        Returns:
            List of SearchResult
        """
        results = []

        # In production, this would use a BM25 index (Elasticsearch, etc.)
        # For now, return empty results - will be implemented with search backend
        logger.debug(f"Keyword search for query: {query[:50]}...")

        return results

    def _reciprocal_rank_fusion(
        self,
        semantic_results: List[SearchResult],
        keyword_results: List[SearchResult],
        alpha: float = 0.5,
        k: int = 60,
    ) -> List[SearchResult]:
        """
        Fuse results using Reciprocal Rank Fusion.

        RRF score = sum(1 / (k + rank_i))

        Args:
            semantic_results: Results from semantic search
            keyword_results: Results from keyword search
            alpha: Weight for semantic vs keyword
            k: RRF constant (typically 60)

        Returns:
            Fused and sorted results
        """
        scores: Dict[str, Dict[str, Any]] = {}

        # Score semantic results
        for rank, result in enumerate(semantic_results):
            rrf_score = alpha * (1 / (k + rank + 1))
            if result.doc_id not in scores:
                scores[result.doc_id] = {"result": result, "score": 0}
            scores[result.doc_id]["score"] += rrf_score

        # Score keyword results
        for rank, result in enumerate(keyword_results):
            rrf_score = (1 - alpha) * (1 / (k + rank + 1))
            if result.doc_id not in scores:
                scores[result.doc_id] = {"result": result, "score": 0}
            scores[result.doc_id]["score"] += rrf_score

        # Sort by fused score
        sorted_items = sorted(scores.values(), key=lambda x: x["score"], reverse=True)

        return [
            SearchResult(
                doc_id=item["result"].doc_id,
                content=item["result"].content,
                score=item["score"],
                metadata=item["result"].metadata,
                source="hybrid",
            )
            for item in sorted_items
        ]

    async def _rerank_results(self, query: str, results: List[SearchResult], top_k: int) -> List[SearchResult]:
        """
        Re-rank results using cross-encoder model.

        Args:
            query: Original query
            results: Results to re-rank
            top_k: Number of results to return

        Returns:
            Re-ranked results
        """
        if not results:
            return []

        try:
            from sentence_transformers import CrossEncoder

            # Load cross-encoder if not already loaded
            if self._reranker is None:
                self._reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

            # Prepare pairs for cross-encoder
            pairs = [(query, doc.content) for doc in results]

            # Get scores (run in thread pool for async)
            loop = asyncio.get_event_loop()
            scores = await loop.run_in_executor(None, lambda: self._reranker.predict(pairs))

            # Update scores
            for doc, score in zip(results, scores):
                doc.score = float(score)

            # Sort by re-ranked score
            reranked = sorted(results, key=lambda x: x.score, reverse=True)
            return reranked[:top_k]

        except ImportError:
            logger.debug("Cross-encoder not available, skipping re-ranking")
            return results[:top_k]
        except Exception as e:
            logger.warning(f"Re-ranking failed: {e}")
            return results[:top_k]


class MultiHopReasoner:
    """
    Multi-hop reasoning engine for complex medical queries.

    This service decomposes complex questions into simpler sub-questions,
    answers each iteratively with retrieval, and synthesizes a final
    comprehensive answer.

    Features:
    - Query decomposition using LLM
    - Iterative retrieval and answering
    - Chain-of-thought reasoning
    - Confidence scoring
    - Source attribution
    """

    def __init__(
        self,
        search_engine: Optional[HybridSearchEngine] = None,
        llm_generator: Optional[Callable] = None,
    ):
        """
        Initialize multi-hop reasoner.

        Args:
            search_engine: Hybrid search engine instance
            llm_generator: Async function for LLM text generation
        """
        self._search_engine = search_engine or HybridSearchEngine()
        self._llm_generator = llm_generator
        self._openai_client = None

    async def _get_llm_response(self, prompt: str, max_tokens: int = 500, temperature: float = 0.3) -> str:
        """
        Generate response using LLM.

        Args:
            prompt: Input prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature

        Returns:
            Generated text
        """
        # Use custom generator if provided
        if self._llm_generator:
            return await self._llm_generator(prompt, max_tokens, temperature)

        # Fall back to OpenAI
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": getattr(settings, "OPENAI_MODEL", "gpt-4-turbo-preview"),
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                    },
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]

        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return ""

    def _detect_strategy(self, query: str) -> ReasoningStrategy:
        """
        Detect the appropriate reasoning strategy for a query.

        Args:
            query: User query

        Returns:
            ReasoningStrategy enum value
        """
        query_lower = query.lower()

        # Comparative queries
        if any(word in query_lower for word in ["compare", "difference", "versus", "vs", "better", "prefer"]):
            return ReasoningStrategy.COMPARATIVE

        # Causal queries
        if any(word in query_lower for word in ["why", "cause", "reason", "leads to", "results in", "because"]):
            return ReasoningStrategy.CAUSAL

        # Temporal queries
        if any(
            word in query_lower
            for word in [
                "when",
                "timeline",
                "progression",
                "stages",
                "before",
                "after",
                "during",
            ]
        ):
            return ReasoningStrategy.TEMPORAL

        # Complex multi-part queries
        if len(query.split()) > 15 or "and" in query_lower or "," in query or query.count("?") > 1:
            return ReasoningStrategy.MULTI_HOP

        # Simple direct queries
        return ReasoningStrategy.DIRECT

    async def reason(
        self,
        query: str,
        max_hops: int = 3,
        context: Optional[str] = None,
        strategy: Optional[ReasoningStrategy] = None,
    ) -> ReasoningResult:
        """
        Perform multi-hop reasoning on a complex query.

        Process:
        1. Detect or use provided reasoning strategy
        2. Decompose query into sub-questions
        3. Answer each sub-question with retrieval
        4. Synthesize final answer from reasoning chain

        Args:
            query: Complex query to answer
            max_hops: Maximum reasoning steps
            context: Optional initial context
            strategy: Optional strategy override

        Returns:
            ReasoningResult with full reasoning chain
        """
        # Detect strategy if not provided
        if strategy is None:
            strategy = self._detect_strategy(query)

        logger.info(
            "Starting multi-hop reasoning",
            extra={
                "query": query[:100],
                "strategy": strategy.value,
                "max_hops": max_hops,
            },
        )

        # For direct queries, use single-step retrieval
        if strategy == ReasoningStrategy.DIRECT:
            return await self._direct_reasoning(query, context)

        # Decompose query into sub-questions
        sub_questions = await self._decompose_query(query, strategy)

        reasoning_chain: List[ReasoningStep] = []
        accumulated_context = context or ""
        all_sources: List[str] = []

        # Answer sub-questions iteratively
        for i, sub_q in enumerate(sub_questions[:max_hops]):
            step = await self._answer_sub_question(
                question=sub_q,
                step_number=i + 1,
                context=accumulated_context,
            )

            reasoning_chain.append(step)
            all_sources.extend(step.sources)

            # Update context for next hop
            accumulated_context += f"\n\nQ: {sub_q}\nA: {step.answer}"

        # Synthesize final answer
        final_answer = await self._synthesize_answer(
            original_query=query,
            reasoning_chain=reasoning_chain,
            strategy=strategy,
        )

        # Calculate overall confidence
        confidence = self._calculate_confidence(reasoning_chain)

        # Deduplicate sources
        unique_sources = list(dict.fromkeys(all_sources))

        return ReasoningResult(
            original_query=query,
            strategy=strategy,
            reasoning_chain=reasoning_chain,
            final_answer=final_answer,
            confidence=confidence,
            sources=unique_sources,
            metadata={
                "num_hops": len(reasoning_chain),
                "sub_questions": [s.question for s in reasoning_chain],
            },
        )

    async def _direct_reasoning(self, query: str, context: Optional[str]) -> ReasoningResult:
        """
        Single-step direct reasoning for simple queries.

        Args:
            query: Simple query
            context: Optional context

        Returns:
            ReasoningResult
        """
        # Search for relevant documents
        search_results = await self._search_engine.search(query, top_k=5)

        # Generate answer
        step = await self._answer_sub_question(
            question=query,
            step_number=1,
            context=context or "",
            search_results=search_results,
        )

        return ReasoningResult(
            original_query=query,
            strategy=ReasoningStrategy.DIRECT,
            reasoning_chain=[step],
            final_answer=step.answer,
            confidence=step.confidence,
            sources=step.sources,
            metadata={"num_hops": 1},
        )

    async def _decompose_query(self, query: str, strategy: ReasoningStrategy) -> List[str]:
        """
        Decompose complex query into simpler sub-questions.

        Args:
            query: Complex query
            strategy: Reasoning strategy

        Returns:
            List of sub-questions
        """
        multi_hop_prompt = (
            "Break down this complex medical question into 2-4 simpler "
            "sub-questions that can be answered independently.\n\n"
            "Question: {query}\n\n"
            "Generate sub-questions that together would help answer "
            "the main question comprehensively.\n"
            "Format: One question per line, no numbering or bullets."
        )
        comparative_prompt = (
            "Break down this comparative medical question into sub-questions "
            "that address each entity separately.\n\n"
            "Question: {query}\n\n"
            "Generate:\n"
            "1. A question about the first entity/option\n"
            "2. A question about the second entity/option\n"
            "3. A question about their key differences\n\n"
            "Format: One question per line, no numbering or bullets."
        )
        causal_prompt = (
            "Break down this causal medical question into sub-questions "
            "that explore the mechanism.\n\n"
            "Question: {query}\n\n"
            "Generate:\n"
            "1. A question about the initial condition/trigger\n"
            "2. A question about the mechanism/pathway\n"
            "3. A question about the outcome/effect\n\n"
            "Format: One question per line, no numbering or bullets."
        )
        temporal_prompt = (
            "Break down this temporal medical question into sub-questions "
            "about different time phases.\n\n"
            "Question: {query}\n\n"
            "Generate:\n"
            "1. A question about the initial phase\n"
            "2. A question about the progression\n"
            "3. A question about the outcome/timeline\n\n"
            "Format: One question per line, no numbering or bullets."
        )
        strategy_prompts = {
            ReasoningStrategy.MULTI_HOP: multi_hop_prompt,
            ReasoningStrategy.COMPARATIVE: comparative_prompt,
            ReasoningStrategy.CAUSAL: causal_prompt,
            ReasoningStrategy.TEMPORAL: temporal_prompt,
        }

        prompt = strategy_prompts.get(strategy, strategy_prompts[ReasoningStrategy.MULTI_HOP]).format(query=query)

        response = await self._get_llm_response(prompt, max_tokens=300)

        # Parse sub-questions
        sub_questions = [
            q.strip().lstrip("0123456789.-) ") for q in response.split("\n") if q.strip() and len(q.strip()) > 10
        ]

        # Ensure at least the original query
        if not sub_questions:
            sub_questions = [query]

        logger.debug(f"Decomposed into {len(sub_questions)} sub-questions")
        return sub_questions

    async def _answer_sub_question(
        self,
        question: str,
        step_number: int,
        context: str,
        search_results: Optional[List[SearchResult]] = None,
    ) -> ReasoningStep:
        """
        Answer a single sub-question with retrieval.

        Args:
            question: Sub-question to answer
            step_number: Current step in reasoning chain
            context: Accumulated context from previous steps
            search_results: Optional pre-fetched search results

        Returns:
            ReasoningStep with answer and metadata
        """
        # Search for relevant documents if not provided
        if search_results is None:
            search_results = await self._search_engine.search(question, top_k=5)

        # Build document context
        doc_context = ""
        sources = []
        doc_ids = []

        for result in search_results:
            source = result.metadata.get("source", "Unknown")
            doc_context += f"\nSource: {source}\n{result.content[:500]}\n"
            sources.append(source)
            doc_ids.append(result.doc_id)

        # Generate answer
        prompt = f"""Based on the following context, answer the question concisely and accurately.

Previous Context:
{context[:1000] if context else "None"}

Retrieved Information:
{doc_context if doc_context else "No documents found."}

Question: {question}

Answer (be concise, cite sources when possible):"""

        answer = await self._get_llm_response(prompt, max_tokens=300)

        # Calculate confidence based on search results
        confidence = self._calculate_step_confidence(search_results, answer)

        return ReasoningStep(
            step_number=step_number,
            question=question,
            retrieved_docs=doc_ids,
            answer=answer,
            confidence=confidence,
            sources=list(dict.fromkeys(sources)),  # Dedupe
        )

    async def _synthesize_answer(
        self,
        original_query: str,
        reasoning_chain: List[ReasoningStep],
        strategy: ReasoningStrategy,
    ) -> str:
        """
        Synthesize final answer from reasoning chain.

        Args:
            original_query: Original complex query
            reasoning_chain: List of reasoning steps
            strategy: Reasoning strategy used

        Returns:
            Synthesized comprehensive answer
        """
        # Build chain summary
        chain_text = "\n".join(
            [
                f"Step {step.step_number}: {step.question}\n"
                f"Answer: {step.answer}\n"
                f"Sources: {', '.join(step.sources[:3])}"
                for step in reasoning_chain
            ]
        )

        synth_comparative = (
            "Based on the reasoning chain below, provide a clear comparison "
            "answering the original question.\n\n"
            "Original Question: {query}\n\n"
            "Reasoning Chain:\n{chain}\n\n"
            "Provide a comprehensive comparison that:\n"
            "1. Summarizes key points about each option\n"
            "2. Highlights important differences\n"
            "3. Provides a clear conclusion\n\n"
            "Synthesized Answer:"
        )
        synth_causal = (
            "Based on the reasoning chain below, explain the causal "
            "relationship answering the original question.\n\n"
            "Original Question: {query}\n\n"
            "Reasoning Chain:\n{chain}\n\n"
            "Provide a comprehensive explanation that:\n"
            "1. Describes the initial trigger/condition\n"
            "2. Explains the mechanism step by step\n"
            "3. Describes the final outcome\n\n"
            "Synthesized Answer:"
        )
        synth_temporal = (
            "Based on the reasoning chain below, provide a timeline-based "
            "answer to the original question.\n\n"
            "Original Question: {query}\n\n"
            "Reasoning Chain:\n{chain}\n\n"
            "Provide a comprehensive timeline that:\n"
            "1. Describes the initial phase\n"
            "2. Explains the progression\n"
            "3. Describes the outcome and typical timeframes\n\n"
            "Synthesized Answer:"
        )
        synthesis_prompts = {
            ReasoningStrategy.COMPARATIVE: synth_comparative,
            ReasoningStrategy.CAUSAL: synth_causal,
            ReasoningStrategy.TEMPORAL: synth_temporal,
        }

        default_prompt = (
            "Based on the reasoning chain below, provide a comprehensive "
            "answer to the original question.\n\n"
            "Original Question: {query}\n\n"
            "Reasoning Chain:\n{chain}\n\n"
            "Synthesized Answer (comprehensive, well-structured, "
            "with source attribution):"
        )

        prompt = synthesis_prompts.get(strategy, default_prompt).format(query=original_query, chain=chain_text)

        return await self._get_llm_response(prompt, max_tokens=500)

    def _calculate_step_confidence(self, search_results: List[SearchResult], answer: str) -> float:
        """
        Calculate confidence for a single reasoning step.

        Args:
            search_results: Retrieved documents
            answer: Generated answer

        Returns:
            Confidence score 0-1
        """
        if not search_results:
            return 0.3  # Low confidence without sources

        # Base confidence from search scores
        if search_results:
            avg_score = sum(r.score for r in search_results) / len(search_results)
            base_confidence = min(0.9, avg_score)
        else:
            base_confidence = 0.3

        # Adjust based on answer quality indicators
        if len(answer) < 20:
            base_confidence *= 0.5  # Very short answers
        elif "I don't know" in answer.lower() or "unclear" in answer.lower():
            base_confidence *= 0.6  # Uncertainty expressed

        return round(base_confidence, 2)

    def _calculate_confidence(self, reasoning_chain: List[ReasoningStep]) -> float:
        """
        Calculate overall confidence for the reasoning.

        Args:
            reasoning_chain: List of reasoning steps

        Returns:
            Overall confidence score 0-1
        """
        if not reasoning_chain:
            return 0.0

        # Average confidence across steps
        avg_confidence = sum(s.confidence for s in reasoning_chain) / len(reasoning_chain)

        # Bonus for complete chain
        completeness_bonus = min(0.1, len(reasoning_chain) * 0.03)

        return min(1.0, avg_confidence + completeness_bonus)

    def to_dict(self, result: ReasoningResult) -> Dict[str, Any]:
        """
        Convert ReasoningResult to dictionary for API response.

        Args:
            result: ReasoningResult to convert

        Returns:
            Dictionary representation
        """
        return {
            "original_query": result.original_query,
            "strategy": result.strategy.value,
            "reasoning_chain": [
                {
                    "step": step.step_number,
                    "question": step.question,
                    "answer": step.answer,
                    "confidence": step.confidence,
                    "sources": step.sources,
                    "doc_ids": step.retrieved_docs,
                }
                for step in result.reasoning_chain
            ],
            "final_answer": result.final_answer,
            "confidence": result.confidence,
            "sources": result.sources,
            "metadata": result.metadata,
        }


# Global service instances (lazy loaded)
hybrid_search_engine = HybridSearchEngine(lazy_load=True)
multi_hop_reasoner = MultiHopReasoner(search_engine=hybrid_search_engine)
