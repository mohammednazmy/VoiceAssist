"""
Integrations - External System Connectors

Provides adapters for external clinical systems:
- FHIR R4 client for EHR integration
- Epic adapter for Epic MyChart/Hyperspace
- Provider health monitoring
- EHR data service for session context management

Phase 6: Read-Only Epic FHIR Integration
"""

from .fhir import EHRDataStatus  # Client; Epic; EHR Service; Models
from .fhir import (
    EHRDataService,
    EHRQueryResult,
    EHRSessionContext,
    EpicAdapter,
    EpicConfig,
    EpicEnvironment,
    FHIRAllergyIntolerance,
    FHIRAuthenticationError,
    FHIRAuthorizationError,
    FHIRClient,
    FHIRClientConfig,
    FHIRCondition,
    FHIRError,
    FHIRMedication,
    FHIRNotFoundError,
    FHIRObservation,
    FHIRPatient,
    FHIRProcedure,
    FHIRServerError,
    FHIRTimeoutError,
    create_epic_adapter,
)

__all__ = [
    # Client
    "FHIRClient",
    "FHIRClientConfig",
    "FHIRError",
    "FHIRAuthenticationError",
    "FHIRAuthorizationError",
    "FHIRNotFoundError",
    "FHIRServerError",
    "FHIRTimeoutError",
    # Epic
    "EpicAdapter",
    "EpicConfig",
    "EpicEnvironment",
    "create_epic_adapter",
    # EHR Service
    "EHRDataService",
    "EHRDataStatus",
    "EHRSessionContext",
    "EHRQueryResult",
    # Models
    "FHIRPatient",
    "FHIRMedication",
    "FHIRCondition",
    "FHIRObservation",
    "FHIRProcedure",
    "FHIRAllergyIntolerance",
]
