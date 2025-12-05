---
title: Tools And Integrations
slug: tools-and-integrations
summary: "**Last Updated**: 2025-11-20"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - human
  - ai-agents
tags:
  - tools
  - and
  - integrations
category: reference
component: "backend/tools"
relatedPaths:
  - "services/api-gateway/app/services/tools/tool_service.py"
  - "services/api-gateway/app/api/admin_tools.py"
  - "services/api-gateway/app/api/admin_integrations.py"
ai_summary: >-
  Last Updated: 2025-11-20 Status: Design Complete Version: V2.0 >
  Implementation Note: This document describes the V2 tools architecture design.
  The current production implementation lives in: > > - Tool Service:
  services/api-gateway/app/services/tools/tool_service.py > - Individual Tools:
  service...
---

# VoiceAssist V2 - Tools and Integrations

**Last Updated**: 2025-11-20
**Status**: Design Complete
**Version**: V2.0

> **Implementation Note:** This document describes the V2 tools architecture design. The current production implementation lives in:
>
> - **Tool Service:** `services/api-gateway/app/services/tools/tool_service.py`
> - **Individual Tools:** `services/api-gateway/app/services/tools/*.py`
> - **Legacy Location:** `server/app/tools/` (deprecated)

---

## Table of Contents

1. [Overview](#overview)
2. [Tool Architecture](#tool-architecture)
3. [Tool Registry](#tool-registry)
4. [Tool Definitions](#tool-definitions)
5. [Tool Security Model](#tool-security-model)
6. [Tool Invocation Flow](#tool-invocation-flow)
7. [Tool Results and Citations](#tool-results-and-citations)
8. [Frontend Integration](#frontend-integration)
9. [Observability and Monitoring](#observability-and-monitoring)
10. [Error Handling](#error-handling)
11. [Testing Tools](#testing-tools)
12. [Future Tools](#future-tools)

---

## Overview

VoiceAssist V2 implements a **first-class tools layer** that allows the AI model to take actions on behalf of the user. Tools are integrated with the **OpenAI Realtime API** and the backend orchestrator to provide:

- **Calendar operations** (view events, create appointments)
- **File operations** (search Nextcloud files, retrieve documents)
- **Medical knowledge retrieval** (OpenEvidence, PubMed, guidelines)
- **Medical calculations** (dosing, risk scores, differential diagnosis)
- **Web search** (current medical information)

### Key Features

- **Type-Safe**: All tools use Pydantic models for arguments and results
- **PHI-Aware**: Tools classified by PHI handling capability
- **Auditable**: All tool calls logged with full parameters and results
- **Secure**: Permission checks, rate limiting, input validation
- **Observable**: Prometheus metrics for all tool invocations
- **User-Confirmed**: High-risk tools require user confirmation before execution

### Design Principles

1. **Least Privilege**: Tools only get access they need
2. **Explicit > Implicit**: Always require user confirmation for risky operations
3. **Fail Safe**: Errors should not expose PHI or system internals
4. **Auditable**: Every tool call recorded with full context
5. **Testable**: Mock implementations for testing

---

## Tool Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenAI Realtime API                      │
│                  (Function Calling / Tools)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Voice Proxy Service                       │
│  - Receives tool calls from OpenAI                              │
│  - Validates tool arguments                                     │
│  - Routes to backend orchestrator                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Query Orchestrator Service                   │
│  - Tool execution engine                                        │
│  - PHI detection and routing                                    │
│  - Confirmation management                                      │
│  - Result assembly                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
┌─────────────────────────┐   ┌────────────────────────┐
│   Local Tool Modules    │   │  External API Clients  │
│  - calendar_tool.py     │   │  - OpenEvidence        │
│  - nextcloud_tool.py    │   │  - PubMed              │
│  - calculator_tool.py   │   │  - Web Search          │
│  - diagnosis_tool.py    │   │  - UpToDate (if avail) │
└─────────────────────────┘   └────────────────────────┘
```

### Tool Lifecycle

1. **Registration**: Tool defined with schema, registered in TOOL_REGISTRY
2. **Discovery**: OpenAI Realtime API receives tool definitions
3. **Invocation**: AI model calls tool with arguments
4. **Validation**: Arguments validated against Pydantic model
5. **Authorization**: Permission check (user, PHI status, rate limits)
6. **Confirmation**: User prompt if required (high-risk operations)
7. **Execution**: Tool logic runs (API call, calculation, file access)
8. **Result**: Structured result returned to AI model
9. **Audit**: Tool call logged to database with full context
10. **Citation**: Result converted to citation if needed

---

## Tool Registry

### TOOL_REGISTRY Structure

All tools are registered in `server/app/tools/registry.py`:

```python
from typing import Dict, Type, Callable
from pydantic import BaseModel
from app.tools.base import ToolDefinition, ToolResult

TOOL_REGISTRY: Dict[str, ToolDefinition] = {}
TOOL_MODELS: Dict[str, Type[BaseModel]] = {}
TOOL_HANDLERS: Dict[str, Callable] = {}

def register_tool(
    name: str,
    definition: ToolDefinition,
    model: Type[BaseModel],
    handler: Callable
):
    """Register a tool with schema, model, and handler"""
    TOOL_REGISTRY[name] = definition
    TOOL_MODELS[name] = model
    TOOL_HANDLERS[name] = handler
```

### ToolDefinition Schema

```python
class ToolDefinition(BaseModel):
    """Tool definition for OpenAI Realtime API"""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema

    # VoiceAssist-specific metadata
    category: str  # "calendar", "file", "medical", "calculation", "search"
    requires_phi: bool  # True if tool processes PHI
    requires_confirmation: bool  # True if user must confirm
    risk_level: str  # "low", "medium", "high"
    rate_limit: Optional[int] = None  # Max calls per minute
    timeout_seconds: int = 30
```

---

## Tool Definitions

### Tool 1: Get Calendar Events

**Purpose**: Retrieve calendar events for a date range

**Tool Name**: `get_calendar_events`

**Category**: Calendar

**PHI Status**: `requires_phi: true` (patient appointments may contain PHI)

**Confirmation Required**: `false` (read-only)

**Risk Level**: `low`

**Arguments**:

```python
class GetCalendarEventsArgs(BaseModel):
    start_date: str  # ISO 8601 format (YYYY-MM-DD)
    end_date: str    # ISO 8601 format (YYYY-MM-DD)
    calendar_name: Optional[str] = None  # Filter by calendar
    max_results: Optional[int] = 50
```

**Returns**:

```python
class CalendarEvent(BaseModel):
    id: str
    title: str
    start: str  # ISO 8601 datetime
    end: str    # ISO 8601 datetime
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_name: str
    all_day: bool = False

class GetCalendarEventsResult(BaseModel):
    events: List[CalendarEvent]
    total_count: int
    date_range: str  # "2024-01-15 to 2024-01-20"
```

**Example Call**:

```json
{
  "tool": "get_calendar_events",
  "arguments": {
    "start_date": "2024-01-15",
    "end_date": "2024-01-20"
  }
}
```

**Implementation**: CalDAV integration with Nextcloud Calendar

---

### Tool 2: Create Calendar Event

**Purpose**: Create a new calendar event

**Tool Name**: `create_calendar_event`

**Category**: Calendar

**PHI Status**: `requires_phi: true` (may contain patient names)

**Confirmation Required**: `true` (creates data)

**Risk Level**: `medium`

**Arguments**:

```python
class CreateCalendarEventArgs(BaseModel):
    title: str
    start_datetime: str  # ISO 8601 datetime
    end_datetime: str    # ISO 8601 datetime
    location: Optional[str] = None
    description: Optional[str] = None
    calendar_name: Optional[str] = "Default"
    all_day: bool = False
```

**Returns**:

```python
class CreateCalendarEventResult(BaseModel):
    event_id: str
    title: str
    start: str
    end: str
    created: bool = True
    message: str  # "Event created successfully"
```

**Confirmation Prompt**:

```
"I'd like to create a calendar event:
- Title: {title}
- Start: {start_datetime}
- End: {end_datetime}
- Location: {location}

Should I proceed?"
```

**Implementation**: CalDAV POST to Nextcloud Calendar

---

### Tool 3: Search Nextcloud Files

**Purpose**: Search for files in Nextcloud by name or content

**Tool Name**: `search_nextcloud_files`

**Category**: File

**PHI Status**: `requires_phi: true` (files may contain PHI)

**Confirmation Required**: `false` (read-only)

**Risk Level**: `low`

**Arguments**:

```python
class SearchNextcloudFilesArgs(BaseModel):
    query: str  # Search query
    file_type: Optional[str] = None  # "pdf", "docx", "txt", etc.
    max_results: Optional[int] = 20
    include_content: bool = False  # Search file contents
```

**Returns**:

```python
class NextcloudFile(BaseModel):
    file_id: str
    name: str
    path: str
    size: int  # bytes
    mime_type: str
    modified: str  # ISO 8601 datetime
    url: str  # WebDAV URL

class SearchNextcloudFilesResult(BaseModel):
    files: List[NextcloudFile]
    total_count: int
    query: str
```

**Example Call**:

```json
{
  "tool": "search_nextcloud_files",
  "arguments": {
    "query": "diabetes guidelines",
    "file_type": "pdf",
    "max_results": 10
  }
}
```

**Implementation**: Nextcloud WebDAV search API

---

### Tool 4: Retrieve Nextcloud File

**Purpose**: Retrieve the contents of a specific Nextcloud file

**Tool Name**: `retrieve_nextcloud_file`

**Category**: File

**PHI Status**: `requires_phi: true` (file may contain PHI)

**Confirmation Required**: `false` (read-only)

**Risk Level**: `low`

**Arguments**:

```python
class RetrieveNextcloudFileArgs(BaseModel):
    file_id: str  # File ID from search results
    extract_text: bool = True  # Extract text from PDF/DOCX
    max_chars: Optional[int] = 10000  # Limit text extraction
```

**Returns**:

```python
class RetrieveNextcloudFileResult(BaseModel):
    file_id: str
    name: str
    content: Optional[str] = None  # Extracted text
    content_truncated: bool = False
    mime_type: str
    size: int
    url: str
```

**Implementation**: WebDAV GET + text extraction (PyPDF2, docx)

---

### Tool 5: Search OpenEvidence

**Purpose**: Search OpenEvidence API for medical evidence

**Tool Name**: `search_openevidence`

**Category**: Medical

**PHI Status**: `requires_phi: false` (external API, no PHI sent)

**Confirmation Required**: `false` (read-only external API)

**Risk Level**: `low`

**Arguments**:

```python
class SearchOpenEvidenceArgs(BaseModel):
    query: str  # Medical question
    max_results: Optional[int] = 5
    evidence_level: Optional[str] = None  # "high", "moderate", "low"
```

**Returns**:

```python
class OpenEvidenceResult(BaseModel):
    title: str
    summary: str
    evidence_level: str  # "high", "moderate", "low"
    source: str  # Journal name
    pubmed_id: Optional[str] = None
    url: str
    date: Optional[str] = None

class SearchOpenEvidenceResponse(BaseModel):
    results: List[OpenEvidenceResult]
    total_count: int
    query: str
```

**Example Call**:

```json
{
  "tool": "search_openevidence",
  "arguments": {
    "query": "beta blockers in heart failure",
    "max_results": 5
  }
}
```

**Implementation**: OpenEvidence REST API client

---

### Tool 6: Search PubMed

**Purpose**: Search PubMed for medical literature

**Tool Name**: `search_pubmed`

**Category**: Medical

**PHI Status**: `requires_phi: false` (external API, no PHI sent)

**Confirmation Required**: `false` (read-only external API)

**Risk Level**: `low`

**Arguments**:

```python
class SearchPubMedArgs(BaseModel):
    query: str  # PubMed search query
    max_results: Optional[int] = 10
    publication_types: Optional[List[str]] = None  # ["Clinical Trial", "Review"]
    date_from: Optional[str] = None  # YYYY/MM/DD
    date_to: Optional[str] = None    # YYYY/MM/DD
```

**Returns**:

```python
class PubMedArticle(BaseModel):
    pmid: str
    title: str
    authors: List[str]
    journal: str
    publication_date: str
    abstract: Optional[str] = None
    doi: Optional[str] = None
    url: str  # PubMed URL

class SearchPubMedResult(BaseModel):
    articles: List[PubMedArticle]
    total_count: int
    query: str
```

**Implementation**: NCBI E-utilities API (esearch + efetch)

---

### Tool 7: Calculate Medical Score

**Purpose**: Calculate medical risk scores and dosing

**Tool Name**: `calculate_medical_score`

**Category**: Calculation

**PHI Status**: `requires_phi: true` (patient data used in calculation)

**Confirmation Required**: `false` (deterministic calculation)

**Risk Level**: `medium` (results used for clinical decisions)

**Arguments**:

```python
class CalculateMedicalScoreArgs(BaseModel):
    calculator_name: str  # "wells_dvt", "chadsvasc", "grace", "renal_dosing"
    parameters: Dict[str, Any]  # Calculator-specific parameters
```

**Returns**:

```python
class MedicalScoreResult(BaseModel):
    calculator_name: str
    score: Union[float, str]
    interpretation: str
    risk_category: Optional[str] = None
    recommendations: Optional[List[str]] = None
    parameters_used: Dict[str, Any]
```

**Example Call** (Wells' DVT Score):

```json
{
  "tool": "calculate_medical_score",
  "arguments": {
    "calculator_name": "wells_dvt",
    "parameters": {
      "active_cancer": true,
      "paralysis_recent": false,
      "bedridden_3days": true,
      "localized_tenderness": true,
      "entire_leg_swollen": false,
      "calf_swelling_3cm": true,
      "pitting_edema": true,
      "collateral_veins": false,
      "alternative_diagnosis": false
    }
  }
}
```

**Example Result**:

```json
{
  "calculator_name": "wells_dvt",
  "score": 6.0,
  "interpretation": "High probability of DVT",
  "risk_category": "high",
  "recommendations": [
    "Consider urgent ultrasound",
    "Consider empiric anticoagulation if no contraindications"
  ],
  "parameters_used": { ... }
}
```

**Supported Calculators**:

- `wells_dvt`: Wells' Criteria for DVT
- `wells_pe`: Wells' Criteria for Pulmonary Embolism
- `chadsvasc`: CHA2DS2-VASc Score (stroke risk in AFib)
- `hasbled`: HAS-BLED Score (bleeding risk)
- `grace`: GRACE Score (ACS risk)
- `meld`: MELD Score (liver disease severity)
- `renal_dosing`: Renal dose adjustment calculator
- `bmi`: BMI calculator with interpretation

**Implementation**: Local calculation library (no external API)

---

### Tool 8: Search Medical Guidelines

**Purpose**: Search curated medical guidelines (CDC, WHO, specialty societies)

**Tool Name**: `search_medical_guidelines`

**Category**: Medical

**PHI Status**: `requires_phi: false` (local database search)

**Confirmation Required**: `false` (read-only)

**Risk Level**: `low`

**Arguments**:

```python
class SearchMedicalGuidelinesArgs(BaseModel):
    query: str  # Search query
    guideline_source: Optional[str] = None  # "cdc", "who", "acc", "aha", etc.
    condition: Optional[str] = None  # Filter by condition
    max_results: Optional[int] = 10
```

**Returns**:

```python
class MedicalGuideline(BaseModel):
    id: str
    title: str
    source: str  # "CDC", "WHO", "AHA", etc.
    condition: str  # "Diabetes", "Hypertension", etc.
    summary: str
    url: str
    publication_date: str
    last_updated: str

class SearchMedicalGuidelinesResult(BaseModel):
    guidelines: List[MedicalGuideline]
    total_count: int
    query: str
```

**Implementation**: Local vector search in knowledge base (guidelines ingested via automated scrapers)

---

### Tool 9: Generate Differential Diagnosis

**Purpose**: Generate differential diagnosis list based on symptoms

**Tool Name**: `generate_differential_diagnosis`

**Category**: Medical

**PHI Status**: `requires_phi: true` (patient symptoms)

**Confirmation Required**: `false` (informational only)

**Risk Level**: `medium` (clinical decision support)

**Arguments**:

```python
class GenerateDifferentialDiagnosisArgs(BaseModel):
    chief_complaint: str
    symptoms: List[str]
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None  # "M", "F", "Other"
    relevant_history: Optional[List[str]] = None
    max_results: Optional[int] = 10
```

**Returns**:

```python
class DiagnosisCandidate(BaseModel):
    diagnosis: str
    probability: str  # "high", "medium", "low"
    key_features: List[str]  # Matching symptoms
    missing_features: List[str]  # Expected but not present
    next_steps: List[str]  # Recommended workup

class GenerateDifferentialDiagnosisResult(BaseModel):
    chief_complaint: str
    diagnoses: List[DiagnosisCandidate]
    reasoning: str
    disclaimers: List[str] = [
        "This is not a substitute for clinical judgment",
        "Consider patient context and physical exam findings"
    ]
```

**Example Call**:

```json
{
  "tool": "generate_differential_diagnosis",
  "arguments": {
    "chief_complaint": "chest pain",
    "symptoms": ["substernal chest pressure", "shortness of breath", "diaphoresis", "pain radiating to left arm"],
    "patient_age": 65,
    "patient_sex": "M",
    "relevant_history": ["hypertension", "diabetes", "smoking history"],
    "max_results": 5
  }
}
```

**Implementation**: RAG system + medical knowledge base + BioGPT

---

### Tool 10: Web Search (Medical)

**Purpose**: Search the web for current medical information

**Tool Name**: `web_search_medical`

**Category**: Search

**PHI Status**: `requires_phi: false` (no PHI sent to external search)

**Confirmation Required**: `false` (read-only)

**Risk Level**: `low`

**Arguments**:

```python
class WebSearchMedicalArgs(BaseModel):
    query: str
    max_results: Optional[int] = 5
    domain_filter: Optional[List[str]] = None  # ["nih.gov", "cdc.gov"]
```

**Returns**:

```python
class WebSearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    domain: str
    date: Optional[str] = None

class WebSearchMedicalResponse(BaseModel):
    results: List[WebSearchResult]
    total_count: int
    query: str
```

**Implementation**: Google Custom Search API or Brave Search API (filtered to medical domains)

---

## Tool Security Model

### PHI Handling Rules

**Tools with `requires_phi: true`:**

- Calendar tools (patient appointments)
- Nextcloud file tools (may contain patient documents)
- Medical calculators (patient data)
- Differential diagnosis (patient symptoms)

**Security Requirements:**

- Must not send PHI to external APIs
- Must run locally or use HIPAA-compliant services
- Must log tool calls with PHI flag
- Must redact PHI from error messages

**Tools with `requires_phi: false`:**

- OpenEvidence search
- PubMed search
- Medical guidelines search
- Web search

**Security Requirements:**

- Safe to call external APIs
- No PHI in query parameters
- Rate limiting to prevent abuse

### Confirmation Requirements

**Tools requiring user confirmation (`requires_confirmation: true`):**

- `create_calendar_event`: Creates data
- Any tool that modifies state

**Confirmation Flow:**

1. Tool call received from OpenAI
2. Orchestrator detects `requires_confirmation: true`
3. Send confirmation request to frontend
4. User approves/denies via UI
5. If approved, execute tool and return result
6. If denied, return "User declined" message to AI

### Rate Limiting

**Per-Tool Rate Limits:**

- Calendar tools: 10 calls/minute
- File tools: 20 calls/minute
- Medical search tools: 30 calls/minute
- Calculators: 50 calls/minute (local, fast)

**Implementation**: Redis-based rate limiter with sliding window

### Input Validation

**All tool arguments validated with Pydantic:**

- Type checking
- Range validation
- Format validation (dates, enums)
- Length limits (prevent injection attacks)

**Example Validation:**

```python
class GetCalendarEventsArgs(BaseModel):
    start_date: str = Field(..., regex=r'^\d{4}-\d{2}-\d{2}$')
    end_date: str = Field(..., regex=r'^\d{4}-\d{2}-\d{2}$')
    max_results: Optional[int] = Field(50, ge=1, le=100)
```

---

## Tool Invocation Flow

### Step-by-Step Flow

```
1. User speaks: "What's on my calendar tomorrow?"
   ↓
2. OpenAI Realtime API recognizes need for tool call
   ↓
3. OpenAI calls tool: get_calendar_events(start_date="2024-01-16", end_date="2024-01-16")
   ↓
4. Voice Proxy receives tool call
   ↓
5. Voice Proxy forwards to Query Orchestrator
   ↓
6. Orchestrator validates arguments (Pydantic)
   ↓
7. Orchestrator checks permissions (user auth, rate limit)
   ↓
8. Orchestrator detects PHI: true (calendar events)
   ↓
9. Orchestrator checks confirmation: false (read-only)
   ↓
10. Orchestrator executes tool handler: calendar_tool.get_events()
    ↓
11. Tool handler calls CalDAV API → Nextcloud
    ↓
12. Nextcloud returns events
    ↓
13. Tool handler returns structured result
    ↓
14. Orchestrator logs tool call to audit log
    ↓
15. Orchestrator creates ToolResult object
    ↓
16. ToolResult returned to Voice Proxy
    ↓
17. Voice Proxy sends result to OpenAI Realtime API
    ↓
18. OpenAI synthesizes natural language response: "You have 3 meetings tomorrow..."
    ↓
19. User hears response
```

### Confirmation Flow (for high-risk tools)

```
1. User: "Create a meeting with Dr. Smith at 2pm tomorrow"
   ↓
2. OpenAI calls: create_calendar_event(title="Meeting with Dr. Smith", ...)
   ↓
3. Orchestrator detects requires_confirmation: true
   ↓
4. Orchestrator sends confirmation request to frontend:
   {
     "type": "tool_confirmation",
     "tool": "create_calendar_event",
     "arguments": { ... },
     "prompt": "I'd like to create a calendar event: ..."
   }
   ↓
5. Frontend displays confirmation dialog
   ↓
6. User clicks "Confirm" or "Cancel"
   ↓
7. Frontend sends confirmation response
   ↓
8. If confirmed:
   - Orchestrator executes tool
   - Returns result to OpenAI
   ↓
9. If cancelled:
   - Orchestrator returns "User declined"
   - OpenAI acknowledges: "Okay, I won't create that event"
```

---

## Tool Results and Citations

### ToolResult Structure

```python
class ToolResult(BaseModel):
    tool_name: str
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: float
    timestamp: str  # ISO 8601

    # Citation metadata (if applicable)
    citations: Optional[List[Citation]] = None
```

### Converting Tool Results to Citations

**For tools that return citable content:**

```python
def tool_result_to_citation(tool_result: ToolResult) -> List[Citation]:
    """Convert tool result to citations"""
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
    # ... other tools
```

**Citation Display in Frontend:**

- Show tool name as citation source
- Link to external URLs if available
- Display metadata (e.g., evidence level, date)

---

## Frontend Integration

### React Hooks for Tools

```typescript
// web-app/src/hooks/useToolConfirmation.ts
export function useToolConfirmation() {
  const [pendingTool, setPendingTool] = useState<ToolConfirmation | null>(null);

  const handleToolConfirmation = (confirmation: ToolConfirmation) => {
    setPendingTool(confirmation);
  };

  const confirmTool = async () => {
    // Send confirmation to backend
    await api.confirmTool(pendingTool.tool_call_id, true);
    setPendingTool(null);
  };

  const cancelTool = async () => {
    await api.confirmTool(pendingTool.tool_call_id, false);
    setPendingTool(null);
  };

  return { pendingTool, confirmTool, cancelTool };
}
```

### Tool Confirmation Dialog

```typescript
// web-app/src/components/ToolConfirmationDialog.tsx
export function ToolConfirmationDialog({
  toolCall,
  onConfirm,
  onCancel
}: ToolConfirmationProps) {
  return (
    <Dialog open={!!toolCall}>
      <DialogTitle>Confirm Action</DialogTitle>
      <DialogContent>
        <p>{toolCall.confirmation_prompt}</p>

        <div className="tool-details">
          <h4>Details:</h4>
          <pre>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="outlined">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained">
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Tool Activity Indicator

```typescript
// Show when tools are running
export function ToolActivityIndicator({ activeTool }: { activeTool: string | null }) {
  if (!activeTool) return null;

  return (
    <div className="tool-activity">
      <CircularProgress size={16} />
      <span>Running tool: {activeTool}</span>
    </div>
  );
}
```

---

## Observability and Monitoring

### Prometheus Metrics

**Tool Invocation Metrics:**

```python
tool_calls_total = Counter(
    'voiceassist_tool_calls_total',
    'Total number of tool calls',
    ['tool_name', 'status']  # status: success, error, denied
)

tool_execution_duration_seconds = Histogram(
    'voiceassist_tool_execution_duration_seconds',
    'Tool execution duration',
    ['tool_name']
)

tool_confirmation_rate = Gauge(
    'voiceassist_tool_confirmation_rate',
    'Percentage of tool calls confirmed by users',
    ['tool_name']
)

tool_error_rate = Gauge(
    'voiceassist_tool_error_rate',
    'Tool error rate (errors / total calls)',
    ['tool_name']
)
```

**Example Dashboard Panel:**

```
Tool Call Rate (calls/minute)
- get_calendar_events: 15/min
- search_pubmed: 8/min
- calculate_medical_score: 5/min
- create_calendar_event: 2/min

Tool Success Rate
- get_calendar_events: 99.5%
- search_pubmed: 98.2%
- calculate_medical_score: 100%
- create_calendar_event: 95.0% (5% denied by users)

Tool P95 Latency
- get_calendar_events: 250ms
- search_pubmed: 1200ms
- search_openevidence: 1500ms
- calculate_medical_score: 50ms
```

### Structured Logging

```python
logger.info(
    "tool_call",
    extra={
        "tool_name": "get_calendar_events",
        "user_id": 123,
        "session_id": "abc123",
        "arguments": {"start_date": "2024-01-15", "end_date": "2024-01-20"},
        "execution_time_ms": 245,
        "status": "success",
        "phi_detected": True,
        "confirmation_required": False
    }
)
```

**PHI Redaction:**

- Never log file contents
- Never log patient names, MRNs
- Hash user identifiers
- Redact PHI from error messages

### Audit Logging

**All tool calls logged to `audit_logs` table:**

```sql
INSERT INTO audit_logs (
  user_id,
  action_type,
  resource_type,
  resource_id,
  action_details,
  phi_involved,
  ip_address,
  user_agent,
  timestamp
) VALUES (
  123,
  'tool_call',
  'calendar',
  NULL,
  '{"tool": "get_calendar_events", "start_date": "2024-01-15"}',
  TRUE,
  '192.168.1.10',
  'VoiceAssist/2.0',
  NOW()
);
```

---

## Error Handling

### Error Types

**1. Validation Errors** (400 Bad Request)

```python
{
  "error": "validation_error",
  "message": "Invalid arguments for tool 'get_calendar_events'",
  "details": {
    "start_date": "Invalid date format, expected YYYY-MM-DD"
  }
}
```

**2. Permission Errors** (403 Forbidden)

```python
{
  "error": "permission_denied",
  "message": "User does not have permission to call tool 'create_calendar_event'"
}
```

**3. Rate Limit Errors** (429 Too Many Requests)

```python
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded for tool 'search_pubmed'",
  "details": {
    "limit": 30,
    "window": "1 minute",
    "retry_after": 15  # seconds
  }
}
```

**4. External API Errors** (502 Bad Gateway)

```python
{
  "error": "external_api_error",
  "message": "Failed to call PubMed API",
  "details": {
    "upstream_status": 503,
    "upstream_message": "Service temporarily unavailable"
  }
}
```

**5. Timeout Errors** (504 Gateway Timeout)

```python
{
  "error": "timeout",
  "message": "Tool execution exceeded timeout of 30 seconds"
}
```

### Error Recovery

**Retry Strategy:**

- Transient errors (5xx): Retry up to 3 times with exponential backoff
- Rate limits: Wait and retry after `retry_after` seconds
- Validation errors: Do not retry (client error)

**Fallback Behavior:**

- If external API fails, fall back to local knowledge base
- If tool times out, return partial results if available
- If confirmation denied, inform AI model gracefully

---

## Testing Tools

### Unit Tests

```python
# server/tests/tools/test_calendar_tool.py
def test_get_calendar_events():
    args = GetCalendarEventsArgs(
        start_date="2024-01-15",
        end_date="2024-01-20"
    )

    result = calendar_tool.get_events(args, user_id=1)

    assert result.success is True
    assert len(result.result["events"]) > 0
    assert result.execution_time_ms < 1000
```

### Integration Tests

```python
def test_tool_invocation_flow():
    # Simulate OpenAI tool call
    tool_call = {
        "tool": "get_calendar_events",
        "arguments": {
            "start_date": "2024-01-15",
            "end_date": "2024-01-20"
        }
    }

    # Send to orchestrator
    response = orchestrator.execute_tool(tool_call, user_id=1)

    # Verify result
    assert response["success"] is True
    assert "events" in response["result"]
```

### Mock Tools for Testing

```python
# server/app/tools/mocks.py
class MockCalendarTool:
    def get_events(self, args, user_id):
        return ToolResult(
            tool_name="get_calendar_events",
            success=True,
            result={
                "events": [
                    {
                        "id": "mock-1",
                        "title": "Team Meeting",
                        "start": "2024-01-15T10:00:00Z",
                        "end": "2024-01-15T11:00:00Z"
                    }
                ],
                "total_count": 1
            },
            execution_time_ms=50,
            timestamp="2024-01-15T09:00:00Z"
        )
```

### Admin Panel Testing UI

**Feature: Test Tool Calls**

- Dropdown to select tool
- Form to enter arguments (JSON editor)
- "Execute Tool" button
- Display result or error
- Show execution time and metrics

---

## Future Tools

### Phase 11+ Enhancements

**Additional Tools to Consider:**

1. **Email Search**: `search_email` - Search Nextcloud Mail
2. **Send Email**: `send_email` - Send email (requires confirmation)
3. **Task Management**: `create_task`, `get_tasks` - Nextcloud Tasks integration
4. **Drug Interaction Check**: `check_drug_interactions` - Check for drug interactions
5. **Clinical Trial Search**: `search_clinical_trials` - ClinicalTrials.gov API
6. **Lab Value Interpretation**: `interpret_lab_values` - Interpret lab results
7. **ICD-10 Code Lookup**: `lookup_icd10` - Look up diagnosis codes
8. **Medical Abbreviation Lookup**: `lookup_medical_abbreviation` - Expand medical abbreviations

### API Expansion

- **UpToDate API**: If licensed, add `search_uptodate` tool
- **FHIR Integration**: Tools to query EHR systems via FHIR
- **HL7 Integration**: Parse HL7 messages for data extraction

---

## Related Documentation

- [ORCHESTRATION_DESIGN.md](ORCHESTRATION_DESIGN.md) - How tools fit into query orchestration
- [DATA_MODEL.md](DATA_MODEL.md) - ToolCall and ToolResult entities
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) - Tool execution service
- [SECURITY_COMPLIANCE.md](SECURITY_COMPLIANCE.md) - PHI handling rules
- [OBSERVABILITY.md](OBSERVABILITY.md) - Metrics and logging
- [WEB_APP_SPECS.md](WEB_APP_SPECS.md) - Frontend tool confirmation UI

---

**Last Updated**: 2025-11-20
**Version**: V2.0
**Total Tools**: 10 (with 8+ future tools)
