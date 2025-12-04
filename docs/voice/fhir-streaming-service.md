# FHIR Streaming Service

**Phase 3 - Voice Mode v4.1**

Real-time FHIR data streaming for clinical context enrichment in voice interactions.

## Overview

The FHIR Subscription Service enables real-time streaming of clinical data (vitals, labs, observations) to enrich the AI assistant's context during healthcare conversations.

```
┌─────────────────┐     ┌────────────────────────────────────┐
│   FHIR Server   │────▶│   FHIR Subscription Service        │
│   (Epic/Cerner) │     │                                    │
└─────────────────┘     │  ┌─────────┐    ┌──────────────┐  │
                        │  │WebSocket│    │Context Builder│  │
        Vitals ────────▶│  │  /Poll  │───▶│  for Thinker │  │
        Labs   ────────▶│  └─────────┘    └──────────────┘  │
                        │                                    │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
              Thinker Context Injection
              "Patient vitals: BP 120/80, HR 72..."
```

## Features

- **WebSocket Subscriptions**: Real-time push from FHIR R5 servers
- **Polling Fallback**: For servers without subscription support
- **Change Detection**: ETag and Last-Modified tracking
- **Context Builder**: Format observations for AI consumption
- **Reconnection Handling**: Exponential backoff on failures
- **PHI-Aware**: Integrates with PHI routing decisions

## Requirements

```bash
pip install httpx websockets python-dateutil
```

**Environment Variables:**

```bash
FHIR_SERVER_URL=https://fhir.example.com/r4
FHIR_AUTH_TOKEN=your_bearer_token
```

## Feature Flag

```yaml
# flag_definitions.yaml
backend.voice_v4_fhir_streaming:
  default: false
  description: "Enable FHIR data streaming"
```

## Basic Usage

### Initialize and Subscribe

```python
from app.services.fhir_subscription_service import (
    get_fhir_subscription_service,
    FHIRResourceType
)

# Get service
service = get_fhir_subscription_service()
await service.initialize()

# Subscribe to patient updates
subscription = await service.subscribe_to_patient(
    patient_id="patient-123",
    resource_types=[
        FHIRResourceType.VITAL_SIGNS,
        FHIRResourceType.LAB_RESULT,
    ],
    session_id="voice-session-456"
)

print(f"Subscription: {subscription.subscription_id}")
```

### Stream Observations

```python
# Stream observations as they arrive
async for observation in service.stream_observations(patient_id="patient-123"):
    print(f"New: {observation.code_display}: {observation.value_quantity}")
```

### Get Latest Data

```python
# Get latest vitals (one-time query)
vitals = await service.get_latest_vitals(
    patient_id="patient-123",
    max_results=5
)

for vital in vitals:
    print(vital.to_context_string())
    # Output: "Blood Pressure: 120/80 mmHg"

# Get latest labs
labs = await service.get_latest_labs(
    patient_id="patient-123",
    max_results=10
)
```

## Data Structures

### FHIRObservation

```python
@dataclass
class FHIRObservation:
    resource_id: str
    resource_type: FHIRResourceType
    patient_id: str
    code: str                    # LOINC/SNOMED code
    code_display: str            # Human-readable name
    value: str | None            # String value
    value_quantity: float | None # Numeric value
    value_unit: str | None       # Unit of measure
    effective_datetime: datetime | None
    status: str = "final"
    interpretation: str | None   # "High", "Low", "Normal"
    reference_range: str | None  # "70-100"

    def to_context_string(self) -> str:
        """Format for Thinker context injection."""
        # Returns: "Glucose: 180 mg/dL (High) [ref: 70-100]"
```

### FHIRSubscription

```python
@dataclass
class FHIRSubscription:
    subscription_id: str
    patient_id: str
    resource_types: List[FHIRResourceType]
    status: SubscriptionStatus
    created_at: datetime
    last_event_at: datetime | None
    event_count: int
    error_message: str | None
```

### FHIRResourceType

```python
class FHIRResourceType(str, Enum):
    PATIENT = "Patient"
    OBSERVATION = "Observation"
    CONDITION = "Condition"
    MEDICATION_REQUEST = "MedicationRequest"
    DIAGNOSTIC_REPORT = "DiagnosticReport"
    VITAL_SIGNS = "vital-signs"
    LAB_RESULT = "laboratory"
    ALLERGY_INTOLERANCE = "AllergyIntolerance"
```

## Configuration

### FHIRConfig

```python
@dataclass
class FHIRConfig:
    # Server settings
    fhir_server_url: str = ""
    auth_type: str = "bearer"  # "bearer", "basic", "oauth2"
    auth_token: str | None = None

    # Subscription settings
    subscription_channel: str = "websocket"  # or "polling"
    subscription_timeout_seconds: int = 3600
    max_subscriptions_per_patient: int = 5

    # Polling settings
    polling_interval_seconds: int = 30
    max_polling_results: int = 100

    # Retry settings
    max_retries: int = 3
    retry_delay_seconds: int = 5
    reconnect_delay_seconds: int = 10

    # PHI settings
    require_phi_routing: bool = True
    log_phi_access: bool = True
```

### Custom Configuration

```python
from app.services.fhir_subscription_service import (
    FHIRSubscriptionService,
    FHIRConfig
)

config = FHIRConfig(
    fhir_server_url="https://fhir.hospital.org/r4",
    auth_type="bearer",
    auth_token="your_token",
    subscription_channel="polling",  # Use polling instead of WebSocket
    polling_interval_seconds=15,
)

service = FHIRSubscriptionService(config)
await service.initialize()
```

## Subscription Modes

### WebSocket (Preferred)

```python
# Automatic reconnection with exponential backoff
# Supports FHIR R5 $subscription-events

config = FHIRConfig(
    subscription_channel="websocket",
    max_retries=5,
    reconnect_delay_seconds=10,
)
```

### Polling (Fallback)

```python
# Uses conditional requests (ETag, If-Modified-Since)
# Change detection via seen_ids tracking

config = FHIRConfig(
    subscription_channel="polling",
    polling_interval_seconds=30,
)
```

## Context Injection for Thinker

### FHIRContextBuilder

```python
from app.services.fhir_subscription_service import FHIRContextBuilder

# Build vitals context
vitals_context = FHIRContextBuilder.build_vitals_context(vitals)
# Output:
# Recent vital signs:
#   - Blood Pressure: 120/80 mmHg
#   - Heart Rate: 72 bpm
#   - Temperature: 98.6 F

# Build labs context (highlights abnormal values)
labs_context = FHIRContextBuilder.build_labs_context(labs)
# Output:
# Recent lab results:
#   ABNORMAL VALUES:
#   - Glucose: 180 mg/dL (High) [ref: 70-100]
#   Other results:
#   - Hemoglobin A1c: 6.5 %

# Build combined summary
summary = FHIRContextBuilder.build_clinical_summary(
    vitals=vitals,
    labs=labs,
    max_length=1000
)
```

### Convenience Function

```python
from app.services.fhir_subscription_service import (
    get_patient_context_for_thinker
)

# Get formatted context for AI
context = await get_patient_context_for_thinker(
    patient_id="patient-123",
    include_vitals=True,
    include_labs=True,
    max_vitals=5,
    max_labs=10
)

# Use in Thinker prompt
response = await thinker.generate(
    messages=[{"role": "user", "content": user_question}],
    system=f"Patient clinical data:\n{context}\n\nAnswer the question."
)
```

## Event Callbacks

### Register for Updates

```python
def on_new_observation(event: StreamingEvent):
    if event.observation:
        obs = event.observation
        print(f"New {obs.code_display}: {obs.value_quantity}")

        # Check for critical values
        if obs.interpretation and "critical" in obs.interpretation.lower():
            send_alert(obs)

# Register callback
service._register_callback(patient_id, on_new_observation)

# Cleanup
service._unregister_callback(patient_id, on_new_observation)
```

## Error Handling

### Subscription Status

```python
subscription = await service.subscribe_to_patient(patient_id)

# Check status
if subscription.status == SubscriptionStatus.ERROR:
    print(f"Error: {subscription.error_message}")

# Monitor status changes
while subscription.status == SubscriptionStatus.ACTIVE:
    await asyncio.sleep(10)
    # Subscription auto-reconnects on failure
```

### Reconnection Behavior

```python
# WebSocket reconnection:
# 1. Initial failure → wait 10s → retry
# 2. Second failure → wait 20s → retry
# 3. Third failure → wait 40s → retry
# ... up to max 5 minutes between retries
# After max_retries, status → ERROR
```

## Frontend Integration

### VitalsPanel Component

```tsx
// See: apps/web-app/src/components/voice/VitalsPanel.tsx

interface Vital {
  code: string;
  display: string;
  value: number;
  unit: string;
  interpretation?: string;
  timestamp: string;
}

function VitalsPanel({ patientId }: { patientId: string }) {
  const [vitals, setVitals] = useState<Vital[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`/api/fhir/stream/${patientId}`);

    ws.onmessage = (event) => {
      const vital = JSON.parse(event.data);
      setVitals((prev) => [vital, ...prev.slice(0, 9)]);
    };

    return () => ws.close();
  }, [patientId]);

  return (
    <div className="grid grid-cols-2 gap-2">
      {vitals.map((vital, i) => (
        <div
          key={i}
          className={cn(
            "p-2 rounded border",
            vital.interpretation === "High" && "border-red-500",
            vital.interpretation === "Low" && "border-yellow-500",
          )}
        >
          <div className="text-sm font-medium">{vital.display}</div>
          <div className="text-lg">
            {vital.value} {vital.unit}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Security Considerations

### PHI Handling

```python
# FHIR data contains PHI - ensure proper routing
if config.require_phi_routing:
    # Check PHI router state before streaming
    phi_state = get_phi_router_state(session_id)
    if phi_state.mode != "local":
        # Log PHI access
        if config.log_phi_access:
            logger.info(f"PHI access: {patient_id}", extra={
                "session_id": session_id,
                "phi_mode": phi_state.mode,
            })
```

### Authentication

```python
# Bearer token (most common)
config = FHIRConfig(
    auth_type="bearer",
    auth_token=os.getenv("FHIR_AUTH_TOKEN")
)

# OAuth2 (for production)
# Implement token refresh in custom subclass
```

## Testing

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_fhir_subscription():
    """Test FHIR subscription creation."""
    service = get_fhir_subscription_service()

    with patch.object(service, '_test_connection', return_value=True):
        await service.initialize()

    sub = await service.subscribe_to_patient(
        patient_id="test-patient",
        resource_types=[FHIRResourceType.VITAL_SIGNS]
    )

    assert sub is not None
    assert sub.status == SubscriptionStatus.ACTIVE


@pytest.mark.asyncio
async def test_context_builder():
    """Test FHIR context builder formatting."""
    vitals = [
        FHIRObservation(
            resource_id="v1",
            resource_type=FHIRResourceType.VITAL_SIGNS,
            patient_id="test",
            code="8480-6",
            code_display="Blood Pressure",
            value="120/80",
            value_unit="mmHg",
        )
    ]

    context = FHIRContextBuilder.build_vitals_context(vitals)
    assert "Blood Pressure" in context
    assert "120/80" in context
```

## Related Documentation

- [Voice Mode v4 Overview](./voice-mode-v4-overview.md)
- [PHI-Aware STT Routing](./phi-aware-stt-routing.md)
- [Speaker Diarization Service](./speaker-diarization-service.md)
- [Adaptive Quality Service](./adaptive-quality-service.md)
