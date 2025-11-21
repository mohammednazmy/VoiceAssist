# VoiceAssist V2 - Query Orchestration Design

**Last Updated**: 2025-11-20
**Status**: Canonical Reference
**Purpose**: Define the Conductor/Orchestrator that routes and processes clinical queries

---

## Overview

The **Query Orchestrator** (also called "Conductor" or "RAG Service") is the central component that:
1. Receives user queries
2. Makes routing decisions (PHI detection, source selection, model selection)
3. Orchestrates searches across multiple sources
4. Generates responses with citations
5. Returns structured answers to the user

This document defines its architecture, decision logic, and implementation.

---

## Table of Contents

1. [What is the Orchestrator?](#what-is-the-orchestrator)
2. [Query Flow](#query-flow)
3. [Decision Points](#decision-points)
4. [State Management](#state-management)
5. [Code Structure](#code-structure)
6. [Configuration](#configuration)
7. [Error Handling](#error-handling)
8. [Performance Considerations](#performance-considerations)

---

## What is the Orchestrator?

### Definition

The **Query Orchestrator** is a service layer component that:
- Lives in: `app/services/rag_service.py` (monorepo) or `chat-service/` (microservices)
- Purpose: Coordinate all steps from query → response
- Not exposed directly: Called by API layer (`app/api/chat.py`)

### Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **PHI Detection** | Detect protected health information in query |
| **Intent Classification** | Determine query type (diagnosis, treatment, drug info, etc.) |
| **Source Selection** | Choose which knowledge bases to search |
| **Model Selection** | Route to local Llama or cloud GPT-4 |
| **Parallel Search** | Search multiple sources concurrently |
| **Reranking** | Prioritize most relevant results |
| **Answer Generation** | Generate response with LLM |
| **Response Assembly** | Format response with citations |
| **Audit Logging** | Log all actions for HIPAA compliance |

---

## Query Flow

### High-Level Flow Diagram

```
User Query (via Web App or Voice)
    ↓
[API Layer: app/api/chat.py]
    ↓
[Query Orchestrator: app/services/rag_service.py]
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 1: PHI Detection                                    │
│   ├─ Presidio scan query for PHI entities               │
│   ├─ If PHI detected → route to local Llama model       │
│   └─ If no PHI → route to cloud GPT-4 (cost-effective) │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 2: Intent Classification                            │
│   ├─ ML classifier or rule-based                        │
│   ├─ Query types: diagnosis, treatment, drug info,      │
│   │   guidelines, case consultation, differential dx    │
│   └─ Output: Intent + confidence score                  │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 3: Source Selection                                 │
│   ├─ Based on intent + user preferences                 │
│   ├─ Sources: Internal KB, UpToDate, PubMed,            │
│   │   Guidelines (CDC/WHO), Nextcloud notes             │
│   └─ Output: List of sources to search                  │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 4: Parallel Search                                  │
│   ├─ Search all selected sources concurrently           │
│   ├─ Each source returns top K results                  │
│   ├─ Timeout: 5 seconds per source                      │
│   └─ Output: Combined results list                      │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 5: Reranking & Filtering                           │
│   ├─ Rerank results by relevance (cross-encoder)        │
│   ├─ Filter low-confidence results                      │
│   ├─ Deduplicate similar results                        │
│   └─ Output: Top 5-10 most relevant results             │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 6: Answer Generation                                │
│   ├─ Build prompt with context from top results         │
│   ├─ Include clinical context if available              │
│   ├─ Call selected LLM (Llama local or GPT-4 cloud)     │
│   ├─ Stream response tokens (for real-time UI)          │
│   └─ Output: Generated answer text                      │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Step 7: Response Assembly                                │
│   ├─ Format answer with inline citations                │
│   ├─ Generate citation list with sources                │
│   ├─ Add metadata (model used, cost, PHI detected)      │
│   └─ Output: Complete response object                   │
└─────────────────────────────────────────────────────────┘
    ↓
[Audit Logger: app/services/audit_logger.py]
    ↓
[API Layer: Return response to client]
    ↓
User (Web App or Voice)
```

### Detailed Flow Sequence

1. **Receive Query**
   - Input: `query` (string), `session_id` (uuid), `clinical_context` (optional)
   - Validate inputs
   - Load session history for context

2. **PHI Detection**
   - Service: `PHIDetector` (`app/services/phi_detector.py`)
   - Check for: names, dates, MRNs, SSNs, phone numbers, addresses
   - Output: `PHIResult(has_phi: bool, entities: List[Entity])`

3. **Intent Classification**
   - Service: `IntentClassifier` (`app/services/intent_classifier.py`)
   - Classify query into:
     - `diagnosis` - Differential diagnosis query
     - `treatment` - Treatment recommendations
     - `drug_info` - Drug information/interactions
     - `guideline` - Clinical guideline lookup
     - `case_consultation` - Complex case discussion
     - `general` - General medical question
   - Output: `Intent(type: str, confidence: float)`

4. **Source Selection**
   - Service: `SourceSelector` (`app/services/source_selector.py`)
   - Select based on:
     - Intent type (e.g., drug_info → prioritize drug databases)
     - User preferences (e.g., always search UpToDate first)
     - Clinical context (e.g., specialty-specific sources)
   - Output: `List[SourceConfig]`

5. **Parallel Search**
   - Service: `SearchAggregator` (`app/services/search_aggregator.py`)
   - Execute searches concurrently using `asyncio.gather()`
   - Each search returns: `List[SearchResult]`
   - Timeout: 5 seconds per source (fail gracefully)

6. **Reranking**
   - Service: `ResultReranker` (`app/services/reranker.py`)
   - Use cross-encoder model or relevance scoring
   - Filter results with confidence < 0.3
   - Deduplicate similar results
   - Output: `List[RankedResult]` (top 5-10)

7. **Answer Generation**
   - Service: `AnswerGenerator` (`app/services/answer_generator.py`)
   - Build prompt with:
     - System message (role definition)
     - Query
     - Context from top results
     - Clinical context (if available)
     - Conversation history (last 5 messages)
   - Call LLM with streaming
   - Output: `GeneratedAnswer(text: str, tokens: int, cost: float)`

8. **Response Assembly**
   - Service: `ResponseAssembler` (`app/services/response_assembler.py`)
   - Format answer with inline citations [1], [2], etc.
   - Create citation list with full source details
   - Add metadata: model used, PHI detected, sources searched
   - Output: `QueryResponse` (see DATA_MODEL.md)

9. **Audit Logging**
   - Service: `AuditLogger` (`app/services/audit_logger.py`)
   - Log: query text (redacted if PHI), sources searched, model used, response generated
   - HIPAA-compliant audit trail

10. **Return Response**
    - Send to API layer → Web App / Voice client

---

## Decision Points

### 1. PHI Detection & Routing

**Logic**:
```python
def decide_model(phi_result: PHIResult) -> str:
    """
    Decide which AI model to use based on PHI detection.
    """
    if phi_result.has_phi:
        # Route to local Llama model (PHI never leaves server)
        return "llama-3.1-8b-local"
    else:
        # Route to cloud GPT-4 (better quality, cost-effective)
        return "gpt-4-turbo"
```

**Edge Cases**:
- **False Positive**: PHI detected incorrectly (e.g., common names)
  - Solution: Allow user to override in settings
- **False Negative**: PHI not detected (rare but possible)
  - Solution: Emphasize that users should not enter PHI in queries

### 2. Intent Classification

**Rule-Based Classifier** (simple, fast):
```python
def classify_intent(query: str) -> Intent:
    """
    Classify query intent using keyword matching.
    """
    query_lower = query.lower()

    if any(word in query_lower for word in ["differential", "diagnosis", "ddx"]):
        return Intent(type="diagnosis", confidence=0.9)

    elif any(word in query_lower for word in ["treatment", "manage", "therapy"]):
        return Intent(type="treatment", confidence=0.9)

    elif any(word in query_lower for word in ["drug", "medication", "dose"]):
        return Intent(type="drug_info", confidence=0.9)

    elif any(word in query_lower for word in ["guideline", "recommendation", "protocol"]):
        return Intent(type="guideline", confidence=0.9)

    else:
        return Intent(type="general", confidence=0.6)
```

**ML-Based Classifier** (more accurate, slower):
```python
from transformers import pipeline

classifier = pipeline("text-classification", model="medical-intent-classifier")

def classify_intent_ml(query: str) -> Intent:
    """
    Classify using fine-tuned BERT model.
    """
    result = classifier(query)[0]
    return Intent(
        type=result['label'],
        confidence=result['score']
    )
```

### 3. Source Selection

**Decision Matrix**:

| Intent | Priority Sources | Fallback Sources |
|--------|------------------|------------------|
| `diagnosis` | Internal KB (textbooks), UpToDate | PubMed, Guidelines |
| `treatment` | UpToDate, Guidelines (CDC/WHO) | Internal KB, PubMed |
| `drug_info` | Internal KB (drug references), UpToDate | PubMed |
| `guideline` | Guidelines (CDC/WHO/Specialty), UpToDate | Internal KB |
| `case_consultation` | Internal KB, UpToDate, PubMed | Nextcloud notes |
| `general` | UpToDate, Internal KB | PubMed, Guidelines |

**User Preferences**:
```python
def select_sources(intent: Intent, user_prefs: Dict) -> List[str]:
    """
    Select sources based on intent and user preferences.
    """
    # Default sources for intent
    default_sources = SOURCE_MATRIX[intent.type]

    # Apply user preferences
    if user_prefs.get("prioritize_uptodate"):
        default_sources.insert(0, "uptodate")

    if user_prefs.get("exclude_pubmed"):
        default_sources = [s for s in default_sources if s != "pubmed"]

    # Limit to top 3 sources for speed
    return default_sources[:3]
```

### 4. Confidence Threshold

**When to Ask Clarifying Questions**:
```python
def should_clarify(query: str, intent: Intent, search_results: List) -> bool:
    """
    Decide if query is too ambiguous and needs clarification.
    """
    # Low intent confidence
    if intent.confidence < 0.5:
        return True

    # Very short query
    if len(query.split()) < 3:
        return True

    # No good search results
    if not search_results or max(r.score for r in search_results) < 0.3:
        return True

    # Ambiguous medical term (e.g., "kidney disease" without type)
    if any(term in query.lower() for term in ["kidney disease", "diabetes", "heart failure"]):
        # Check if type/stage is specified
        if not any(spec in query.lower() for spec in ["type 1", "type 2", "acute", "chronic", "stage"]):
            return True

    return False
```

**Clarifying Question Examples**:
- Query: "kidney disease treatment"
  - Clarify: "Are you asking about acute kidney injury (AKI) or chronic kidney disease (CKD)? And if CKD, what stage?"

- Query: "diabetes management"
  - Clarify: "Are you referring to Type 1 or Type 2 diabetes?"

---

## State Management

### Conversation Context

**What to Track**:
```python
class ConversationContext:
    """Track conversation state for context-aware responses"""

    session_id: str
    user_id: str
    message_history: List[ChatMessage]  # Last 10 messages
    clinical_context: Optional[ClinicalContext]  # Patient info
    user_preferences: UserSettings
    current_intent: Optional[Intent]
    clarification_pending: bool
```

**Storage**:
- **Redis**: For active sessions (TTL: 30 minutes of inactivity)
- **PostgreSQL**: For persistent conversation history

**Context Management**:
```python
async def get_context(session_id: str) -> ConversationContext:
    """
    Retrieve conversation context from Redis or DB.
    """
    # Try Redis first (fast)
    cached = await redis_client.get(f"context:{session_id}")
    if cached:
        return ConversationContext.parse_raw(cached)

    # Fallback to DB
    session = await db.query(Session).filter(Session.id == session_id).first()
    messages = await db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at.desc()).limit(10).all()

    context = ConversationContext(
        session_id=session_id,
        user_id=session.user_id,
        message_history=messages,
        clinical_context=session.clinical_context,
        user_preferences=await get_user_settings(session.user_id)
    )

    # Cache in Redis
    await redis_client.setex(
        f"context:{session_id}",
        1800,  # 30 minutes
        context.json()
    )

    return context
```

### Clinical Context Persistence

**When to Use**:
- Case Workspace mode (persistent context)
- Differential Diagnosis assistant (track symptoms, findings)
- Drug interaction checks (track current medications)

**Example**:
```python
# User starts case workspace
context = ClinicalContext(
    session_id=session_id,
    patient_age=65,
    patient_sex="male",
    chief_complaint="chest pain",
    relevant_history="hypertension, diabetes",
    current_medications=["metformin", "lisinopril"]
)

# All subsequent queries use this context
response = await orchestrator.process_query(
    query="what tests should I order?",
    session_id=session_id,
    clinical_context=context  # ← Automatically included
)
```

---

## Code Structure

### Class Hierarchy

```python
# app/services/rag_service.py

from typing import Optional, List, Dict
from app.services.phi_detector import PHIDetector
from app.services.intent_classifier import IntentClassifier
from app.services.source_selector import SourceSelector
from app.services.search_aggregator import SearchAggregator
from app.services.reranker import ResultReranker
from app.services.answer_generator import AnswerGenerator
from app.services.response_assembler import ResponseAssembler
from app.services.audit_logger import AuditLogger
from app.schemas.message import ChatMessage, QueryResponse
from app.schemas.citation import Citation

class QueryOrchestrator:
    """
    Main orchestrator for query processing.
    Coordinates all steps from query → response.
    """

    def __init__(self):
        self.phi_detector = PHIDetector()
        self.intent_classifier = IntentClassifier()
        self.source_selector = SourceSelector()
        self.search_aggregator = SearchAggregator()
        self.reranker = ResultReranker()
        self.answer_generator = AnswerGenerator()
        self.response_assembler = ResponseAssembler()
        self.audit_logger = AuditLogger()

    async def process_query(
        self,
        query: str,
        session_id: str,
        clinical_context: Optional[Dict] = None,
        user_preferences: Optional[Dict] = None
    ) -> QueryResponse:
        """
        Main entry point for query processing.

        Args:
            query: User query text
            session_id: Session UUID
            clinical_context: Optional patient/case context
            user_preferences: Optional user settings override

        Returns:
            QueryResponse with answer, citations, metadata
        """
        # 1. Load conversation context
        context = await self._load_context(session_id)

        # 2. PHI detection
        phi_result = await self.phi_detector.detect(query)

        # 3. Intent classification
        intent = await self.intent_classifier.classify(query, context)

        # 4. Check if clarification needed
        if self._should_clarify(query, intent):
            return await self._generate_clarification(query, intent)

        # 5. Source selection
        sources = await self.source_selector.select(
            intent=intent,
            user_prefs=user_preferences or context.user_preferences,
            clinical_context=clinical_context
        )

        # 6. Parallel search
        search_results = await self.search_aggregator.search_all(
            query=query,
            sources=sources,
            timeout=5.0
        )

        # 7. Rerank results
        ranked_results = await self.reranker.rerank(
            query=query,
            results=search_results
        )

        # 8. Select AI model
        model = self._select_model(phi_result)

        # 9. Generate answer
        answer = await self.answer_generator.generate(
            query=query,
            context=ranked_results[:5],  # Top 5 results
            clinical_context=clinical_context,
            conversation_history=context.message_history[-5:],
            model=model
        )

        # 10. Assemble response
        response = await self.response_assembler.assemble(
            query=query,
            answer=answer,
            search_results=ranked_results,
            metadata={
                "phi_detected": phi_result.has_phi,
                "model_used": model.name,
                "sources_searched": [s.name for s in sources],
                "intent": intent.type,
                "tokens": answer.tokens,
                "cost": answer.cost
            }
        )

        # 11. Audit logging
        await self.audit_logger.log_query(
            user_id=context.user_id,
            session_id=session_id,
            query_redacted=self._redact_phi(query, phi_result),
            response_id=response.id,
            phi_detected=phi_result.has_phi,
            sources_searched=[s.name for s in sources]
        )

        return response

    def _select_model(self, phi_result) -> str:
        """Select AI model based on PHI detection"""
        return "llama-3.1-8b-local" if phi_result.has_phi else "gpt-4-turbo"

    def _should_clarify(self, query: str, intent) -> bool:
        """Decide if clarification is needed"""
        # Implementation as shown in Decision Points section
        pass

    async def _generate_clarification(self, query: str, intent) -> QueryResponse:
        """Generate clarifying question"""
        # Implementation: return QueryResponse with clarifying question
        pass

    def _redact_phi(self, text: str, phi_result) -> str:
        """Redact PHI entities for audit logging"""
        for entity in phi_result.entities:
            text = text.replace(entity.text, f"[{entity.type}]")
        return text
```

### Component Services

Each sub-service is a separate module:

```
app/services/
├── rag_service.py              # Main orchestrator (QueryOrchestrator)
├── phi_detector.py             # PHI detection (Presidio)
├── intent_classifier.py        # Intent classification
├── source_selector.py          # Source selection logic
├── search_aggregator.py        # Parallel search across sources
├── reranker.py                 # Result reranking
├── answer_generator.py         # LLM answer generation
├── response_assembler.py       # Response formatting
└── audit_logger.py             # Audit logging
```

---

## Configuration

### Environment Variables

```bash
# AI Model Configuration
AI_ROUTER_MODE=hybrid              # hybrid, local-only, cloud-only
LOCAL_MODEL=llama-3.1-8b
CLOUD_MODEL=gpt-4-turbo

# Source Configuration
ENABLE_UPTODATE=true
ENABLE_PUBMED=true
ENABLE_GUIDELINES=true
UPTODATE_API_KEY=xxx
PUBMED_API_KEY=xxx

# Search Configuration
SEARCH_TIMEOUT=5.0                 # seconds
MAX_PARALLEL_SEARCHES=5
RESULT_LIMIT_PER_SOURCE=10

# Reranking Configuration
RERANKING_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
CONFIDENCE_THRESHOLD=0.3

# PHI Detection Configuration
PHI_DETECTION_MODE=strict          # strict, lenient, off
PRESIDIO_ENTITIES=PERSON,DATE,SSN,PHONE,MRN

# LLM Configuration
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=2000
LLM_STREAMING=true
```

### System Settings

Admins can configure via Admin Panel (see ADMIN_PANEL_SPECS.md):

```typescript
interface AIConfiguration {
  routingStrategy: 'hybrid' | 'local-only' | 'cloud-only';
  localModelName: string;
  cloudModelName: string;
  enabledSources: string[];  // ["uptodate", "pubmed", "guidelines"]
  searchTimeout: number;  // seconds
  confidenceThreshold: number;  // 0-1
  maxTokens: number;
  temperature: number;
  costLimit: number;  // $/month
}
```

### User Preferences

Users can configure via Web App Settings (see WEB_APP_SPECS.md):

```typescript
interface CitationSettings {
  displayStyle: 'inline' | 'footnote' | 'sidebar';
  citationFormat: 'AMA' | 'APA' | 'Vancouver';
  prioritizeSources: string[];  // ["uptodate", "harrison", "pubmed"]
}
```

---

## Failure Modes and Fallback Behavior

### Comprehensive Failure Matrix

| Component | Failure Scenario | Fallback Behavior | User Impact | Recovery Strategy |
|-----------|------------------|-------------------|-------------|-------------------|
| **KB Search (Qdrant)** | Vector DB down or timeout (> 5s) | Use external tools only (PubMed, UpToDate) + warning message | Partial answer, sources from external APIs only | Cache recent searches in Redis; auto-retry with exponential backoff |
| **External Tools (PubMed/UpToDate)** | API timeout or rate limit exceeded | Use KB only + warning message | Partial answer, sources from internal KB only | Implement rate limiting queue; cache API responses (1 hour TTL) |
| **PHI Detector** | Presidio service failure | Assume PHI present, route to local LLM (conservative) | Slower response (local model), extra caution | Alert admin; manual PHI review; temporary bypass flag for emergencies |
| **Intent Classifier** | Classifier failure or low confidence (< 0.3) | Default to "general" intent, search all sources | May search less relevant sources, longer latency | Use rule-based fallback; retrain classifier with user feedback |
| **LLM Generation (Cloud)** | OpenAI API timeout or error | Retry once (exponential backoff), then fallback to local Llama model | Slower response, potentially lower quality | Implement circuit breaker pattern; alert if failure rate > 5% |
| **LLM Generation (Local)** | Ollama service down or OOM | Return curated excerpts from top search results with citations | No generated answer, only source excerpts + warning | Restart Ollama service; increase memory allocation; implement health check |
| **Safety Filters** | Safety check failure (hallucination detector down) | Block response entirely for safety | Error message to user, query logged for review | Manual review queue for admin; implement fallback simple filters (keyword matching) |
| **Search Reranker** | Reranking model failure | Skip reranking, use raw relevance scores from vector search | Potentially less optimal result ordering | Use simpler scoring (keyword overlap + vector score); alert admin |
| **Embedding Generation** | OpenAI embedding API down | Use cached embeddings if query similar (cosine > 0.95), else fail gracefully | Cannot process new queries, use cached or return error | Fallback to local embedding model (all-MiniLM-L6-v2); cache aggressive |
| **Database (PostgreSQL)** | Connection pool exhausted or DB down | Serve from Redis cache if available, else return 503 | Cannot save messages, read-only mode | Increase connection pool; implement read replicas; alert immediately |
| **Redis Cache** | Redis down or eviction | Bypass cache, hit DB/APIs directly (slower) | Increased latency (2-5x slower), higher DB load | Run Redis in cluster mode; increase memory; implement disk persistence |

### Degraded Mode Operation

When **multiple critical components** fail simultaneously (e.g., Qdrant + OpenAI API), enter **Degraded Mode**:

**Behavior:**
1. Return simple curated excerpts from cached search results
2. Display prominent warning: "I'm experiencing technical difficulties. Here are some relevant sources I found: [citations only]"
3. Log incident with full context for investigation
4. Alert monitoring system (PagerDuty, email)
5. Disable background jobs to conserve resources

**Recovery:**
- Automatic recovery check every 60 seconds
- Exit degraded mode when all critical components healthy again
- Send recovery notification to admin

### Error Response Format

```python
class ErrorResponse(BaseModel):
    error: str
    error_code: str  # e.g., "KB_UNAVAILABLE", "LLM_TIMEOUT"
    message: str  # User-friendly message
    retry_after: Optional[int] = None  # seconds
    fallback_response: Optional[str] = None  # Degraded mode response
    trace_id: str  # For debugging
    timestamp: datetime
    component: str  # Which component failed
```

### Example Error Handling

```python
async def search_with_fallback(source: str, query: str, trace_id: str) -> List[Result]:
    """
    Search with timeout and fallback.
    """
    try:
        async with asyncio.timeout(5.0):
            results = await source_clients[source].search(query)
            logger.info(f"Search successful: source={source}, results={len(results)}", trace_id=trace_id)
            return results
    except asyncio.TimeoutError:
        logger.warning(f"Source {source} timed out", trace_id=trace_id)
        # Return empty, continue with other sources
        return []
    except Exception as e:
        logger.error(f"Source {source} error: {e}", trace_id=trace_id, exc_info=True)
        # Check if this is a transient error
        if isinstance(e, (ConnectionError, TimeoutError)):
            # Retry once after 1 second
            await asyncio.sleep(1)
            try:
                results = await source_clients[source].search(query)
                logger.info(f"Search retry successful: source={source}", trace_id=trace_id)
                return results
            except Exception:
                logger.error(f"Source {source} retry failed", trace_id=trace_id)
                return []
        return []

async def process_query_with_circuit_breaker(query: str, trace_id: str) -> QueryResponse:
    """
    Process query with circuit breaker pattern.
    """
    # Check if circuit breaker is open (too many recent failures)
    if circuit_breaker.is_open("llm_generation"):
        logger.warning("Circuit breaker OPEN for LLM generation", trace_id=trace_id)
        # Immediately use fallback (cached response or curated excerpts)
        return await generate_fallback_response(query, trace_id)

    try:
        response = await orchestrator.process_query(query, trace_id=trace_id)
        # Success - close circuit breaker
        circuit_breaker.record_success("llm_generation")
        return response
    except Exception as e:
        # Failure - record in circuit breaker
        circuit_breaker.record_failure("llm_generation")
        logger.error(f"Query processing failed: {e}", trace_id=trace_id, exc_info=True)

        # If circuit breaker opens, use fallback
        if circuit_breaker.is_open("llm_generation"):
            logger.error("Circuit breaker OPENED for LLM generation", trace_id=trace_id)
            alert_admin("LLM generation circuit breaker opened")

        return await generate_fallback_response(query, trace_id)
```

### Circuit Breaker Configuration

```python
class CircuitBreakerConfig:
    failure_threshold: int = 5  # Open after 5 consecutive failures
    success_threshold: int = 2  # Close after 2 consecutive successes
    timeout: int = 60  # Stay open for 60 seconds before trying again
    half_open_requests: int = 1  # Allow 1 request in half-open state
```

---

## Performance Considerations

### Optimization Strategies

1. **Parallel Execution**
   - Search all sources concurrently with `asyncio.gather()`
   - Set reasonable timeouts (5 seconds per source)

2. **Caching**
   - Cache search results in Redis (TTL: 1 hour)
   - Cache embeddings (avoid recomputing)
   - Cache user preferences

3. **Batch Processing**
   - Batch embedding generation (100 queries at once)
   - Batch database inserts (audit logs)

4. **Streaming**
   - Stream LLM responses for real-time UI updates
   - Use Server-Sent Events (SSE) or WebSocket

5. **Resource Limits**
   - Limit concurrent queries per user (rate limiting)
   - Queue background tasks (indexing, audit logging)

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Query Latency** | < 3 seconds (p95) | Time from query → first response token |
| **Search Time** | < 2 seconds | Parallel search across all sources |
| **LLM Generation** | < 2 seconds | Streaming, so first token < 500ms |
| **Cache Hit Rate** | > 30% | For frequently asked questions |
| **Concurrent Users** | 50 (Compose), 200+ (K8s) | With horizontal scaling |

---

## Tool Invocation in Orchestrator

### Overview

The orchestrator supports **tool invocation** to enable the AI model to take actions on behalf of the user. Tools are integrated with the **OpenAI Realtime API** for voice interactions and can also be called from chat queries.

**See [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md) for complete tool documentation.**

### Tool Execution Flow

When the AI model decides to call a tool (via OpenAI Realtime API function calling):

```
1. OpenAI Realtime API → Tool Call Request
   {
     "type": "function_call",
     "function": {
       "name": "get_calendar_events",
       "arguments": "{\"start_date\": \"2024-01-15\", \"end_date\": \"2024-01-20\"}"
     },
     "call_id": "call_abc123"
   }
   ↓
2. Voice Proxy Service → Forward to Orchestrator
   ↓
3. Orchestrator → Tool Execution Engine
   ↓
4. Tool Execution Steps:
   a) Validate tool name (exists in TOOL_REGISTRY)
   b) Parse and validate arguments (Pydantic model)
   c) Check permissions (user auth, PHI status, rate limits)
   d) Check if confirmation required
      - If yes → Send confirmation request to frontend
      - Wait for user response (approve/deny)
      - If denied → Return "User declined" to AI
   e) Execute tool handler
   f) Log tool call to audit log (ToolCall entity)
   g) Return structured result
   ↓
5. Orchestrator → Format ToolResult
   ↓
6. Voice Proxy → Send result to OpenAI Realtime API
   {
     "type": "function_call_output",
     "call_id": "call_abc123",
     "output": "{\"events\": [...], \"total_count\": 3}"
   }
   ↓
7. OpenAI → Synthesize natural language response
   ↓
8. User hears/sees response
```

### Tool Execution Engine

**Location**: `app/services/tool_executor.py` (stub - implement in Phase 5+)

**Key Methods**:

```python
class ToolExecutor:
    """Execute tools with validation, permissions, and audit logging"""

    async def execute_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        user_id: int,
        session_id: str,
        trace_id: str
    ) -> ToolResult:
        """
        Execute a tool with full validation and audit logging.

        Steps:
        1. Validate tool exists
        2. Validate arguments against Pydantic model
        3. Check user permissions
        4. Check PHI routing (if tool requires PHI, ensure local execution)
        5. Check rate limits (Redis-based)
        6. Check if confirmation required
        7. Execute tool handler
        8. Log to audit trail
        9. Return ToolResult
        """
        start_time = time.time()

        try:
            # Step 1: Get tool definition
            tool_def = get_tool_definition(tool_name)
            tool_model = get_tool_model(tool_name)
            tool_handler = get_tool_handler(tool_name)

            # Step 2: Validate arguments
            try:
                validated_args = tool_model(**arguments)
            except ValidationError as e:
                raise ToolValidationError(f"Invalid arguments: {e}")

            # Step 3: Check permissions
            if not await self._check_permissions(user_id, tool_name):
                raise ToolPermissionError(f"User {user_id} lacks permission for tool '{tool_name}'")

            # Step 4: Check PHI routing
            if tool_def.requires_phi:
                # Ensure tool runs locally (no external API calls with PHI)
                logger.info(f"Tool '{tool_name}' requires PHI - local execution only")

            # Step 5: Check rate limits
            if tool_def.rate_limit:
                if not await self._check_rate_limit(user_id, tool_name, tool_def.rate_limit):
                    raise ToolRateLimitError(f"Rate limit exceeded for '{tool_name}'")

            # Step 6: Check if confirmation required
            if tool_def.requires_confirmation:
                confirmed = await self._request_confirmation(
                    tool_name=tool_name,
                    arguments=validated_args.dict(),
                    user_id=user_id,
                    session_id=session_id
                )
                if not confirmed:
                    return ToolResult(
                        tool_name=tool_name,
                        success=False,
                        error="User declined to execute tool",
                        execution_time_ms=(time.time() - start_time) * 1000
                    )

            # Step 7: Execute tool with timeout
            result = await asyncio.wait_for(
                tool_handler(validated_args, user_id),
                timeout=tool_def.timeout_seconds
            )

            # Step 8: Log to audit trail
            await self._log_tool_call(
                tool_name=tool_name,
                arguments=validated_args.dict(),
                result=result,
                user_id=user_id,
                session_id=session_id,
                trace_id=trace_id,
                phi_involved=tool_def.requires_phi
            )

            # Step 9: Update metrics
            tool_calls_total.labels(tool_name=tool_name, status="success").inc()
            tool_execution_duration_seconds.labels(tool_name=tool_name).observe(
                result.execution_time_ms / 1000
            )

            return result

        except ToolTimeoutError:
            logger.error(f"Tool '{tool_name}' timed out after {tool_def.timeout_seconds}s")
            tool_calls_total.labels(tool_name=tool_name, status="timeout").inc()
            return ToolResult(
                tool_name=tool_name,
                success=False,
                error=f"Tool execution timed out after {tool_def.timeout_seconds} seconds",
                execution_time_ms=(time.time() - start_time) * 1000
            )

        except (ToolValidationError, ToolPermissionError, ToolRateLimitError) as e:
            logger.warning(f"Tool execution failed: {e}")
            tool_calls_total.labels(tool_name=tool_name, status="error").inc()
            return ToolResult(
                tool_name=tool_name,
                success=False,
                error=str(e),
                execution_time_ms=(time.time() - start_time) * 1000
            )

        except Exception as e:
            logger.error(f"Unexpected error executing tool '{tool_name}': {e}", exc_info=True)
            tool_calls_total.labels(tool_name=tool_name, status="error").inc()
            return ToolResult(
                tool_name=tool_name,
                success=False,
                error="Internal error executing tool",
                execution_time_ms=(time.time() - start_time) * 1000
            )

    async def _check_permissions(self, user_id: int, tool_name: str) -> bool:
        """Check if user has permission to call tool"""
        # TODO: Implement RBAC check
        # For now, all authenticated users can call all tools
        return True

    async def _check_rate_limit(self, user_id: int, tool_name: str, limit: int) -> bool:
        """Check rate limit using Redis sliding window"""
        # TODO: Implement Redis-based rate limiter
        key = f"rate_limit:tool:{tool_name}:user:{user_id}"
        # Use Redis sliding window counter
        # Return False if limit exceeded
        return True

    async def _request_confirmation(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        user_id: int,
        session_id: str
    ) -> bool:
        """
        Request user confirmation for high-risk tool.

        Sends confirmation request to frontend via WebSocket/SSE.
        Waits for user response (timeout: 60 seconds).
        """
        # TODO: Implement confirmation flow
        # 1. Send confirmation request to frontend
        # 2. Wait for response (asyncio.Event or Redis pub/sub)
        # 3. Return True if confirmed, False if denied or timeout
        logger.info(f"Requesting confirmation for tool '{tool_name}' from user {user_id}")
        return True  # Stub: auto-confirm for now

    async def _log_tool_call(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        result: ToolResult,
        user_id: int,
        session_id: str,
        trace_id: str,
        phi_involved: bool
    ):
        """Log tool call to audit trail (ToolCall entity)"""
        # TODO: Implement audit logging
        # Insert into tool_calls table (see DATA_MODEL.md)
        logger.info(
            "tool_call_audit",
            extra={
                "tool_name": tool_name,
                "user_id": user_id,
                "session_id": session_id,
                "trace_id": trace_id,
                "success": result.success,
                "execution_time_ms": result.execution_time_ms,
                "phi_involved": phi_involved
            }
        )
```

### Integration with Query Orchestrator

The orchestrator's main `process_query` method is updated to handle tool calls:

```python
async def process_query(
    self,
    query: str,
    session_id: str,
    user_id: int,
    clinical_context: Optional[Dict] = None,
    trace_id: Optional[str] = None
) -> QueryResponse:
    """
    Process a user query through the orchestration pipeline.

    Now includes tool execution step for OpenAI Realtime API integration.
    """
    trace_id = trace_id or str(uuid.uuid4())

    # Standard orchestration flow
    phi_result = await self.phi_detector.detect(query)
    intent = await self.intent_classifier.classify(query)

    # NEW: Check if query is actually a tool call from OpenAI
    if query.startswith("__TOOL_CALL__"):
        # This is a tool call, not a regular query
        # Parse tool call data
        tool_call_data = json.loads(query.replace("__TOOL_CALL__", ""))

        # Execute tool
        tool_result = await self.tool_executor.execute_tool(
            tool_name=tool_call_data["name"],
            arguments=tool_call_data["arguments"],
            user_id=user_id,
            session_id=session_id,
            trace_id=trace_id
        )

        # Return tool result wrapped in QueryResponse
        return QueryResponse(
            answer=json.dumps(tool_result.dict()),
            citations=[],
            metadata={
                "type": "tool_result",
                "tool_name": tool_result.tool_name,
                "success": tool_result.success
            }
        )

    # Continue with standard RAG pipeline for regular queries
    sources = self.source_selector.select(intent, user_id)
    search_results = await self.search_aggregator.search_all(query, sources)
    ranked_results = self.reranker.rerank(search_results, query)
    answer = await self.answer_generator.generate(query, ranked_results, clinical_context)
    response = self.response_assembler.assemble(answer, ranked_results)

    return response
```

### Tool Call Routing

**For Voice Mode (OpenAI Realtime API)**:
- Tool calls initiated by AI model via function calling
- Voice Proxy receives tool call → forwards to Orchestrator
- Orchestrator executes tool → returns result to Voice Proxy → back to OpenAI

**For Chat Mode**:
- User explicitly requests action (e.g., "Create a meeting at 2pm")
- Orchestrator detects action intent
- Can trigger tool directly or use OpenAI function calling

### Tool Result to Citation Conversion

Some tools return citable content (e.g., search tools). Convert ToolResult to Citation:

```python
def tool_result_to_citations(tool_result: ToolResult) -> List[Citation]:
    """Convert tool result to citations for display"""
    if tool_result.tool_name == "search_openevidence":
        return [
            Citation(
                text=result["summary"],
                source_type="openevidence",
                source_title=result["title"],
                source_url=result["url"],
                relevance_score=0.95,
                metadata={
                    "evidence_level": result["evidence_level"],
                    "pubmed_id": result.get("pubmed_id")
                }
            )
            for result in tool_result.result["results"]
        ]
    # ... handle other search tools
    return []
```

### Tool Registry Initialization

On application startup, initialize the tool registry:

```python
# app/main.py or app/__init__.py

from app.tools.init_tools import initialize_tools

@app.on_event("startup")
async def startup_event():
    """Initialize tools on application startup"""
    initialize_tools()
    logger.info("VoiceAssist application started with tools initialized")
```

### Tool Metrics

**Prometheus Metrics** (see [OBSERVABILITY.md](OBSERVABILITY.md)):
- `voiceassist_tool_calls_total` - Counter by tool_name and status
- `voiceassist_tool_execution_duration_seconds` - Histogram by tool_name
- `voiceassist_tool_confirmation_rate` - Gauge by tool_name
- `voiceassist_tool_error_rate` - Gauge by tool_name

---

## References

- [TOOLS_AND_INTEGRATIONS.md](TOOLS_AND_INTEGRATIONS.md) - Complete tool documentation
- [DATA_MODEL.md](DATA_MODEL.md) - Entity definitions (QueryResponse, Citation, ToolCall, ToolResult)
- [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) - Service structure
- [SEMANTIC_SEARCH_DESIGN.md](SEMANTIC_SEARCH_DESIGN.md) - Search implementation
- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) - System architecture
- [WEB_APP_SPECS.md](WEB_APP_SPECS.md) - User preferences, tool confirmation UI
- [ADMIN_PANEL_SPECS.md](ADMIN_PANEL_SPECS.md) - System configuration, tool testing
- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - PHI handling, audit logging
- [OBSERVABILITY.md](OBSERVABILITY.md) - Metrics and logging
