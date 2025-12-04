"""
FHIR Integration Package

Provides FHIR R4 client and Epic EHR adapter for VoiceAssist.

Components:
- FHIRClient: Generic FHIR R4 client with caching, retry, rate limiting
- EpicAdapter: Epic-specific adapter with SMART on FHIR OAuth2
- EHRDataService: Session context integration and voice command handlers
- FHIR Models: Strongly-typed Python representations of FHIR resources

Usage:
    from app.integrations.fhir import (
        EpicAdapter,
        EpicConfig,
        EHRDataService,
        FHIRPatient,
    )

    # Create Epic adapter
    config = EpicConfig(
        environment=EpicEnvironment.SANDBOX,
        client_id="your-client-id",
        private_key_path="/path/to/key.pem",
    )
    adapter = EpicAdapter(config)
    await adapter.initialize()

    # Create EHR data service
    service = EHRDataService(epic_adapter=adapter)

    # Fetch patient data
    patient = await adapter.get_patient("patient-fhir-id")
    summary = await adapter.get_patient_summary("patient-fhir-id")
"""

# EHR Data Service
from .ehr_data_service import EHRDataService, EHRDataStatus, EHRQueryResult, EHRSessionContext

# Epic Adapter
from .epic_adapter import EpicAdapter, EpicConfig, EpicEnvironment, EpicToken, create_epic_adapter

# FHIR Client
from .fhir_client import (
    FHIRAuthenticationError,
    FHIRAuthorizationError,
    FHIRCache,
    FHIRClient,
    FHIRClientConfig,
    FHIRClientStats,
    FHIRError,
    FHIRNotFoundError,
    FHIRRateLimitError,
    FHIRRequestMetrics,
    FHIRServerError,
    FHIRTimeoutError,
)

# FHIR Models
from .fhir_models import (
    AllergyCategory,
    AllergyCriticality,
    AllergySeverity,
    CodeableConcept,
    ConditionStatus,
    FHIRAllergyIntolerance,
    FHIRCondition,
    FHIRMedication,
    FHIRObservation,
    FHIRPatient,
    FHIRProcedure,
    FHIRResourceType,
    Identifier,
    MedicationStatus,
    ObservationStatus,
    Period,
    Quantity,
    Reference,
)

__all__ = [
    # Client
    "FHIRClient",
    "FHIRClientConfig",
    "FHIRClientStats",
    "FHIRRequestMetrics",
    "FHIRError",
    "FHIRAuthenticationError",
    "FHIRAuthorizationError",
    "FHIRNotFoundError",
    "FHIRRateLimitError",
    "FHIRServerError",
    "FHIRTimeoutError",
    "FHIRCache",
    # Epic
    "EpicAdapter",
    "EpicConfig",
    "EpicEnvironment",
    "EpicToken",
    "create_epic_adapter",
    # EHR Service
    "EHRDataService",
    "EHRDataStatus",
    "EHRSessionContext",
    "EHRQueryResult",
    # Models
    "FHIRResourceType",
    "MedicationStatus",
    "ConditionStatus",
    "ObservationStatus",
    "AllergyCategory",
    "AllergySeverity",
    "AllergyCriticality",
    "CodeableConcept",
    "Identifier",
    "Reference",
    "Period",
    "Quantity",
    "FHIRPatient",
    "FHIRMedication",
    "FHIRCondition",
    "FHIRObservation",
    "FHIRProcedure",
    "FHIRAllergyIntolerance",
]
