"""
Epic FHIR Adapter

Epic-specific FHIR R4 adapter with:
- SMART on FHIR OAuth2 authentication (Backend Services)
- JWT client credentials flow
- Token caching and automatic refresh
- Epic-specific API quirks handling
- Provider health monitoring integration

Supports both Epic sandbox and production environments.

References:
- Epic FHIR API: https://fhir.epic.com/
- SMART Backend Services: https://www.hl7.org/fhir/smart-app-launch/backend-services.html
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

import aiohttp
import jwt

from .fhir_client import FHIRAuthenticationError, FHIRClient, FHIRClientConfig, FHIRError, FHIRWriteResult
from .fhir_models import FHIRPatient, FHIRResourceType

logger = logging.getLogger(__name__)


# ==============================================================================
# Configuration
# ==============================================================================


class EpicEnvironment(str, Enum):
    """Epic environment types"""

    SANDBOX = "sandbox"
    PRODUCTION = "production"


@dataclass
class EpicConfig:
    """
    Epic adapter configuration.

    Credentials should be stored securely (env vars, secrets manager).
    """

    # Environment
    environment: EpicEnvironment = EpicEnvironment.SANDBOX

    # OAuth2 credentials (Backend Services)
    client_id: str = ""
    private_key_path: Optional[str] = None
    private_key_pem: Optional[str] = None  # Alternative to path

    # Epic endpoints
    base_url: Optional[str] = None  # Auto-set based on environment
    token_url: Optional[str] = None  # Auto-set based on environment

    # Token settings
    token_lifetime_seconds: int = 300  # 5 minutes (Epic max)
    token_refresh_buffer_seconds: int = 60  # Refresh 1 min before expiry

    # Request settings
    timeout_seconds: int = 30
    max_retries: int = 3

    # Epic-specific settings
    epic_client_id: Optional[str] = None  # Epic-assigned client ID
    organization_id: Optional[str] = None  # FHIR Organization ID

    def __post_init__(self):
        """Set default URLs based on environment"""
        if self.environment == EpicEnvironment.SANDBOX:
            if not self.base_url:
                self.base_url = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4"
            if not self.token_url:
                self.token_url = "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token"
        else:
            # Production URLs are organization-specific
            if not self.base_url or not self.token_url:
                raise ValueError("Production environment requires explicit base_url and token_url")


@dataclass
class EpicToken:
    """OAuth2 token with metadata"""

    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 300
    scope: str = ""
    issued_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def expires_at(self) -> datetime:
        return self.issued_at + timedelta(seconds=self.expires_in)

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() >= self.expires_at

    def is_expiring_soon(self, buffer_seconds: int = 60) -> bool:
        return datetime.utcnow() >= (self.expires_at - timedelta(seconds=buffer_seconds))


# ==============================================================================
# Epic Adapter
# ==============================================================================


class EpicAdapter(FHIRClient):
    """
    Epic FHIR adapter with SMART on FHIR authentication.

    Implements Backend Services OAuth2 flow for server-to-server access.

    Usage:
        config = EpicConfig(
            environment=EpicEnvironment.SANDBOX,
            client_id="your-client-id",
            private_key_path="/path/to/private_key.pem",
        )
        adapter = EpicAdapter(config)
        await adapter.initialize()

        patient = await adapter.get_patient("T1wI5bk8n1YVgvWk63mM1GReJjl39qtnPoggmgCc-F1QB")
    """

    def __init__(
        self,
        epic_config: EpicConfig,
        event_bus=None,
        audit_service=None,
    ):
        self.epic_config = epic_config

        # Build FHIR client config
        fhir_config = FHIRClientConfig(
            base_url=epic_config.base_url,
            timeout_seconds=epic_config.timeout_seconds,
            max_retries=epic_config.max_retries,
        )

        super().__init__(
            config=fhir_config,
            event_bus=event_bus,
            audit_service=audit_service,
        )

        self._private_key: Optional[str] = None
        self._token: Optional[EpicToken] = None
        self._token_lock = asyncio.Lock()

        # Provider monitoring
        self._health_status = "unknown"
        self._last_health_check: Optional[datetime] = None
        self._consecutive_errors = 0
        self._error_threshold = 5

    async def initialize(self) -> None:
        """Initialize adapter and load credentials"""
        await super().initialize()

        # Load private key
        self._private_key = await self._load_private_key()

        # Pre-fetch initial token
        try:
            await self._ensure_token()
            self._health_status = "healthy"
        except Exception as e:
            logger.warning(f"Failed to get initial token: {e}")
            self._health_status = "degraded"

        logger.info(
            f"EpicAdapter initialized for {self.epic_config.environment.value} " f"(status: {self._health_status})"
        )

    async def _load_private_key(self) -> str:
        """Load private key for JWT signing"""
        if self.epic_config.private_key_pem:
            return self.epic_config.private_key_pem

        if self.epic_config.private_key_path:
            try:
                with open(self.epic_config.private_key_path, "r") as f:
                    return f.read()
            except FileNotFoundError:
                raise FHIRAuthenticationError(f"Private key not found: {self.epic_config.private_key_path}")

        # Try environment variable
        key = os.environ.get("EPIC_PRIVATE_KEY")
        if key:
            return key

        raise FHIRAuthenticationError(
            "No private key provided. Set private_key_path, private_key_pem, "
            "or EPIC_PRIVATE_KEY environment variable."
        )

    # =========================================================================
    # OAuth2 Authentication
    # =========================================================================

    async def get_access_token(self) -> Optional[str]:
        """Get valid access token, refreshing if needed"""
        await self._ensure_token()
        return self._token.access_token if self._token else None

    async def refresh_access_token(self) -> Optional[str]:
        """Force token refresh"""
        async with self._token_lock:
            self._token = None
        return await self.get_access_token()

    async def _ensure_token(self) -> None:
        """Ensure we have a valid token"""
        async with self._token_lock:
            if self._token and not self._token.is_expiring_soon(self.epic_config.token_refresh_buffer_seconds):
                return

            self._token = await self._fetch_token()

    async def _fetch_token(self) -> EpicToken:
        """
        Fetch new access token using JWT client credentials.

        Implements SMART Backend Services OAuth2 flow.
        """
        logger.debug("Fetching new Epic access token")

        # Create JWT assertion
        now = int(time.time())
        claims = {
            "iss": self.epic_config.client_id,
            "sub": self.epic_config.client_id,
            "aud": self.epic_config.token_url,
            "jti": f"{now}-{id(self)}",
            "exp": now + 300,  # 5 minutes
            "iat": now,
        }

        # Sign with RS384 (Epic requirement)
        try:
            assertion = jwt.encode(
                claims,
                self._private_key,
                algorithm="RS384",
            )
        except Exception as e:
            raise FHIRAuthenticationError(f"Failed to sign JWT: {e}")

        # Request token
        data = {
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": assertion,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.epic_config.token_url,
                    data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        self._consecutive_errors += 1
                        raise FHIRAuthenticationError(f"Token request failed ({response.status}): {text}")

                    token_data = await response.json()

        except aiohttp.ClientError as e:
            self._consecutive_errors += 1
            raise FHIRAuthenticationError(f"Token request error: {e}")

        self._consecutive_errors = 0
        self._health_status = "healthy"

        return EpicToken(
            access_token=token_data["access_token"],
            token_type=token_data.get("token_type", "Bearer"),
            expires_in=token_data.get("expires_in", 300),
            scope=token_data.get("scope", ""),
        )

    # =========================================================================
    # Epic-Specific Methods
    # =========================================================================

    async def get_patient_by_mrn(
        self,
        mrn: str,
        organization_id: Optional[str] = None,
    ) -> Optional[FHIRPatient]:
        """
        Search for patient by MRN.

        Args:
            mrn: Medical Record Number
            organization_id: Optional organization ID for scoping

        Returns:
            FHIRPatient if found, None otherwise
        """
        params = {"identifier": f"urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.14|{mrn}"}

        if organization_id or self.epic_config.organization_id:
            org = organization_id or self.epic_config.organization_id
            params["_has:EpisodeOfCare:patient:organization"] = org

        results = await self.search(FHIRResourceType.PATIENT, params, max_results=1)
        return results[0] if results else None

    async def get_patient_summary(
        self,
        patient_id: str,
    ) -> Dict[str, Any]:
        """
        Get comprehensive patient summary.

        Fetches patient demographics, medications, conditions, allergies,
        recent vitals, and recent labs in parallel.

        Args:
            patient_id: Epic patient FHIR ID

        Returns:
            Dictionary with all patient data
        """
        # Fetch all data in parallel
        results = await asyncio.gather(
            self.get_patient(patient_id),
            self.get_patient_medications(patient_id, active_only=True),
            self.get_patient_conditions(patient_id, active_only=True),
            self.get_patient_allergies(patient_id),
            self.get_patient_vitals(patient_id, days_back=7),
            self.get_patient_labs(patient_id, days_back=30),
            return_exceptions=True,
        )

        patient, medications, conditions, allergies, vitals, labs = results

        # Handle errors gracefully
        summary = {
            "patient": patient.to_dict() if isinstance(patient, FHIRPatient) else None,
            "medications": ([m.to_dict() for m in medications] if isinstance(medications, list) else []),
            "conditions": ([c.to_dict() for c in conditions] if isinstance(conditions, list) else []),
            "allergies": ([a.to_dict() for a in allergies] if isinstance(allergies, list) else []),
            "vitals": [v.to_dict() for v in vitals] if isinstance(vitals, list) else [],
            "labs": [l.to_dict() for l in labs] if isinstance(labs, list) else [],
            "fetched_at": datetime.utcnow().isoformat(),
        }

        # Log any errors
        for name, result in [
            ("patient", patient),
            ("medications", medications),
            ("conditions", conditions),
            ("allergies", allergies),
            ("vitals", vitals),
            ("labs", labs),
        ]:
            if isinstance(result, Exception):
                logger.warning(f"Error fetching {name}: {result}")
                summary[f"{name}_error"] = str(result)

        return summary

    async def get_recent_encounter(
        self,
        patient_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get patient's most recent encounter"""
        url = f"{self.config.base_url}/Encounter"
        params = {
            "patient": patient_id,
            "_sort": "-date",
            "_count": "1",
        }

        response = await self._request("GET", url, "Encounter", "search", params=params)

        if response and response.get("entry"):
            return response["entry"][0].get("resource")
        return None

    async def search_patients(
        self,
        name: Optional[str] = None,
        birthdate: Optional[str] = None,
        gender: Optional[str] = None,
        max_results: int = 10,
    ) -> List[FHIRPatient]:
        """
        Search for patients by demographics.

        Args:
            name: Patient name (partial match)
            birthdate: Birth date (YYYY-MM-DD)
            gender: Gender (male, female)
            max_results: Maximum results

        Returns:
            List of matching patients
        """
        params = {}
        if name:
            params["name"] = name
        if birthdate:
            params["birthdate"] = birthdate
        if gender:
            params["gender"] = gender

        if not params:
            return []

        return await self.search(
            FHIRResourceType.PATIENT,
            params,
            max_results=max_results,
        )

    # =========================================================================
    # Phase 6b: Write Operations
    # =========================================================================

    async def create_medication_request(
        self,
        patient_id: str,
        medication_code: str,
        medication_system: str,
        medication_display: str,
        dosage_instruction: str,
        requester_id: str,
        encounter_id: Optional[str] = None,
        reason_code: Optional[str] = None,
        reason_display: Optional[str] = None,
        dispense_quantity: Optional[float] = None,
        dispense_unit: Optional[str] = None,
        refills: int = 0,
        as_needed: bool = False,
        notes: Optional[str] = None,
    ) -> FHIRWriteResult:
        """
        Create a medication request (prescription/order).

        Args:
            patient_id: Patient FHIR ID
            medication_code: RxNorm code for medication
            medication_system: Code system (usually RxNorm)
            medication_display: Medication display name
            dosage_instruction: Dosing instructions
            requester_id: Practitioner FHIR ID
            encounter_id: Optional encounter reference
            reason_code: ICD-10 code for indication
            reason_display: Reason display text
            dispense_quantity: Quantity to dispense
            dispense_unit: Unit for quantity
            refills: Number of refills allowed
            as_needed: PRN medication
            notes: Additional notes

        Returns:
            FHIRWriteResult with created resource ID
        """
        resource = {
            "resourceType": "MedicationRequest",
            "status": "active",
            "intent": "order",
            "medicationCodeableConcept": {
                "coding": [
                    {
                        "system": medication_system,
                        "code": medication_code,
                        "display": medication_display,
                    }
                ],
                "text": medication_display,
            },
            "subject": {
                "reference": f"Patient/{patient_id}",
            },
            "requester": {
                "reference": f"Practitioner/{requester_id}",
            },
            "authoredOn": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "dosageInstruction": [
                {
                    "text": dosage_instruction,
                    "asNeededBoolean": as_needed,
                }
            ],
        }

        if encounter_id:
            resource["encounter"] = {"reference": f"Encounter/{encounter_id}"}

        if reason_code:
            resource["reasonCode"] = [
                {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/sid/icd-10-cm",
                            "code": reason_code,
                            "display": reason_display or reason_code,
                        }
                    ],
                }
            ]

        if dispense_quantity:
            resource["dispenseRequest"] = {
                "quantity": {
                    "value": dispense_quantity,
                    "unit": dispense_unit or "tablets",
                },
                "numberOfRepeatsAllowed": refills,
            }

        if notes:
            resource["note"] = [{"text": notes}]

        result = await self.create(FHIRResourceType.MEDICATION_REQUEST, resource)

        # Audit logging
        if self.audit_service:
            await self._log_write_operation(
                action="create",
                resource_type="MedicationRequest",
                resource_id=result.resource_id,
                patient_id=patient_id,
                details={
                    "medication": medication_display,
                    "dosage": dosage_instruction,
                },
            )

        return result

    async def create_service_request(
        self,
        patient_id: str,
        code: str,
        code_system: str,
        code_display: str,
        category: str,  # "laboratory", "imaging", "procedure"
        requester_id: str,
        encounter_id: Optional[str] = None,
        reason_code: Optional[str] = None,
        reason_display: Optional[str] = None,
        priority: str = "routine",  # routine, urgent, asap, stat
        notes: Optional[str] = None,
        specimen_instructions: Optional[str] = None,
    ) -> FHIRWriteResult:
        """
        Create a service request (lab order, imaging order, procedure order).

        Args:
            patient_id: Patient FHIR ID
            code: LOINC/CPT code for the order
            code_system: Code system URL
            code_display: Order display name
            category: Order category (laboratory, imaging, procedure)
            requester_id: Practitioner FHIR ID
            encounter_id: Optional encounter reference
            reason_code: ICD-10 code for indication
            reason_display: Reason display text
            priority: Order priority
            notes: Additional notes
            specimen_instructions: Instructions for specimen collection

        Returns:
            FHIRWriteResult with created resource ID
        """
        # Map category to FHIR coding
        category_map = {
            "laboratory": ("108252007", "Laboratory procedure"),
            "imaging": ("363679005", "Imaging"),
            "procedure": ("387713003", "Surgical procedure"),
        }
        cat_code, cat_display = category_map.get(category, ("unknown", category))

        resource = {
            "resourceType": "ServiceRequest",
            "status": "active",
            "intent": "order",
            "priority": priority,
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": cat_code,
                            "display": cat_display,
                        }
                    ],
                }
            ],
            "code": {
                "coding": [
                    {
                        "system": code_system,
                        "code": code,
                        "display": code_display,
                    }
                ],
                "text": code_display,
            },
            "subject": {
                "reference": f"Patient/{patient_id}",
            },
            "requester": {
                "reference": f"Practitioner/{requester_id}",
            },
            "authoredOn": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        if encounter_id:
            resource["encounter"] = {"reference": f"Encounter/{encounter_id}"}

        if reason_code:
            resource["reasonCode"] = [
                {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/sid/icd-10-cm",
                            "code": reason_code,
                            "display": reason_display or reason_code,
                        }
                    ],
                }
            ]

        if notes:
            resource["note"] = [{"text": notes}]

        if specimen_instructions:
            resource["patientInstruction"] = specimen_instructions

        result = await self.create(FHIRResourceType.SERVICE_REQUEST, resource)

        # Audit logging
        if self.audit_service:
            await self._log_write_operation(
                action="create",
                resource_type="ServiceRequest",
                resource_id=result.resource_id,
                patient_id=patient_id,
                details={
                    "category": category,
                    "code": code_display,
                    "priority": priority,
                },
            )

        return result

    async def create_document_reference(
        self,
        patient_id: str,
        document_type: str,  # "clinical-note", "discharge-summary", etc.
        title: str,
        content: str,
        author_id: str,
        encounter_id: Optional[str] = None,
        document_status: str = "current",  # current, superseded, entered-in-error
        content_type: str = "text/plain",
    ) -> FHIRWriteResult:
        """
        Create a document reference (clinical note, summary, etc.).

        Args:
            patient_id: Patient FHIR ID
            document_type: Type of document
            title: Document title
            content: Document content (base64 encoded if binary)
            author_id: Practitioner FHIR ID
            encounter_id: Optional encounter reference
            document_status: Document status
            content_type: MIME type of content

        Returns:
            FHIRWriteResult with created resource ID
        """
        import base64

        # Map document type to LOINC
        type_map = {
            "clinical-note": ("11506-3", "Progress note"),
            "discharge-summary": ("18842-5", "Discharge summary"),
            "consultation": ("11488-4", "Consultation note"),
            "history-physical": ("34117-2", "History and physical note"),
            "operative-note": ("11504-8", "Operative note"),
        }
        type_code, type_display = type_map.get(
            document_type, ("47039-3", "Inpatient Admission history and physical note")
        )

        # Encode content as base64
        content_b64 = base64.b64encode(content.encode()).decode()

        resource = {
            "resourceType": "DocumentReference",
            "status": document_status,
            "docStatus": "final" if document_status == "current" else "preliminary",
            "type": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": type_code,
                        "display": type_display,
                    }
                ],
            },
            "subject": {
                "reference": f"Patient/{patient_id}",
            },
            "author": [
                {
                    "reference": f"Practitioner/{author_id}",
                }
            ],
            "date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "description": title,
            "content": [
                {
                    "attachment": {
                        "contentType": content_type,
                        "data": content_b64,
                        "title": title,
                        "creation": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    },
                }
            ],
        }

        if encounter_id:
            resource["context"] = {
                "encounter": [{"reference": f"Encounter/{encounter_id}"}],
            }

        result = await self.create(FHIRResourceType.DOCUMENT_REFERENCE, resource)

        # Audit logging
        if self.audit_service:
            await self._log_write_operation(
                action="create",
                resource_type="DocumentReference",
                resource_id=result.resource_id,
                patient_id=patient_id,
                details={
                    "document_type": document_type,
                    "title": title,
                    "content_length": len(content),
                },
            )

        return result

    async def cancel_medication_request(
        self,
        medication_request_id: str,
        reason: Optional[str] = None,
    ) -> FHIRWriteResult:
        """
        Cancel an existing medication request.

        Args:
            medication_request_id: Resource ID to cancel
            reason: Reason for cancellation

        Returns:
            FHIRWriteResult
        """
        # Get current version for ETag
        etag = await self.get_resource_version(
            FHIRResourceType.MEDICATION_REQUEST,
            medication_request_id,
        )

        # Get current resource
        current = await self.read(
            FHIRResourceType.MEDICATION_REQUEST,
            medication_request_id,
            use_cache=False,
        )

        if not current:
            raise FHIRError(f"MedicationRequest {medication_request_id} not found")

        # Update status to cancelled
        current._raw["status"] = "cancelled"
        if reason:
            current._raw["statusReason"] = {
                "text": reason,
            }

        result = await self.update(
            FHIRResourceType.MEDICATION_REQUEST,
            medication_request_id,
            current._raw,
            etag=etag,
        )

        if self.audit_service:
            await self._log_write_operation(
                action="cancel",
                resource_type="MedicationRequest",
                resource_id=medication_request_id,
                patient_id=current.patient.get_id() if current.patient else None,
                details={"reason": reason},
            )

        return result

    async def cancel_service_request(
        self,
        service_request_id: str,
        reason: Optional[str] = None,
    ) -> FHIRWriteResult:
        """
        Cancel an existing service request.

        Args:
            service_request_id: Resource ID to cancel
            reason: Reason for cancellation

        Returns:
            FHIRWriteResult
        """
        etag = await self.get_resource_version(
            FHIRResourceType.SERVICE_REQUEST,
            service_request_id,
        )

        # Get current resource
        url = f"{self.config.base_url}/ServiceRequest/{service_request_id}"
        current = await self._request("GET", url, "ServiceRequest", "read")

        if not current:
            raise FHIRError(f"ServiceRequest {service_request_id} not found")

        # Update status to revoked
        current["status"] = "revoked"
        if reason:
            current["note"] = current.get("note", [])
            current["note"].append(
                {
                    "text": f"Cancelled: {reason}",
                    "time": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )

        result = await self.update(
            FHIRResourceType.SERVICE_REQUEST,
            service_request_id,
            current,
            etag=etag,
        )

        if self.audit_service:
            patient_ref = current.get("subject", {}).get("reference", "")
            patient_id = patient_ref.split("/")[-1] if "/" in patient_ref else None
            await self._log_write_operation(
                action="cancel",
                resource_type="ServiceRequest",
                resource_id=service_request_id,
                patient_id=patient_id,
                details={"reason": reason},
            )

        return result

    # =========================================================================
    # Conflict Detection
    # =========================================================================

    async def check_medication_conflicts(
        self,
        patient_id: str,
        medication_code: str,
    ) -> Dict[str, Any]:
        """
        Check for potential medication conflicts before ordering.

        Args:
            patient_id: Patient FHIR ID
            medication_code: RxNorm code of medication to check

        Returns:
            Dict with conflict information
        """
        conflicts = {
            "has_conflicts": False,
            "duplicate_orders": [],
            "active_same_medication": [],
            "warnings": [],
        }

        # Get patient's current medications
        current_meds = await self.get_patient_medications(patient_id, active_only=True)

        for med in current_meds:
            if med.rxnorm_code == medication_code:
                conflicts["has_conflicts"] = True
                conflicts["duplicate_orders"].append(
                    {
                        "id": med.id,
                        "name": med.medication_name,
                        "dosage": med.dosage_instruction,
                        "authored_on": (med.authored_on.isoformat() if med.authored_on else None),
                    }
                )

        # Check for similar medications (same therapeutic class)
        # This would require additional terminology services
        if conflicts["duplicate_orders"]:
            conflicts["warnings"].append(f"Patient already has active order for {medication_code}")

        return conflicts

    async def check_service_request_conflicts(
        self,
        patient_id: str,
        code: str,
        lookback_days: int = 30,
    ) -> Dict[str, Any]:
        """
        Check for duplicate service requests.

        Args:
            patient_id: Patient FHIR ID
            code: LOINC/CPT code to check
            lookback_days: Days to look back for duplicates

        Returns:
            Dict with conflict information
        """
        conflicts = {
            "has_conflicts": False,
            "recent_same_order": [],
            "warnings": [],
        }

        # Search for recent orders with same code
        params = {
            "patient": patient_id,
            "code": code,
            "status": "active,completed",
        }

        url = f"{self.config.base_url}/ServiceRequest"
        response = await self._request("GET", url, "ServiceRequest", "search", params=params)

        if response and response.get("entry"):
            cutoff = datetime.utcnow() - timedelta(days=lookback_days)

            for entry in response["entry"]:
                resource = entry.get("resource", {})
                authored_on = resource.get("authoredOn", "")

                if authored_on:
                    order_date = _parse_datetime_safe(authored_on)
                    if order_date and order_date > cutoff:
                        conflicts["has_conflicts"] = True
                        conflicts["recent_same_order"].append(
                            {
                                "id": resource.get("id"),
                                "code": resource.get("code", {}).get("text", ""),
                                "status": resource.get("status"),
                                "authored_on": authored_on,
                            }
                        )

        if conflicts["recent_same_order"]:
            conflicts["warnings"].append(
                f"Patient has {len(conflicts['recent_same_order'])} similar order(s) in last {lookback_days} days"
            )

        return conflicts

    async def _log_write_operation(
        self,
        action: str,
        resource_type: str,
        resource_id: Optional[str],
        patient_id: Optional[str],
        details: Dict[str, Any],
    ) -> None:
        """Log EHR write operation to audit service"""
        if not self.audit_service:
            return

        try:
            await self.audit_service.log_ehr_access(
                user_id="system",  # Would be passed from context
                session_id="",  # Would be passed from context
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details={
                    **details,
                    "patient_id": patient_id,
                    "provider": "epic",
                    "environment": self.epic_config.environment.value,
                    "operation": "write",
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log write operation: {e}")

    # =========================================================================
    # Provider Health Monitoring
    # =========================================================================

    async def check_health(self) -> Dict[str, Any]:
        """
        Check Epic API health.

        Performs a simple metadata request to verify connectivity.
        """
        self._last_health_check = datetime.utcnow()

        try:
            url = f"{self.config.base_url}/metadata"
            start = time.monotonic()

            async with self._session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                latency_ms = (time.monotonic() - start) * 1000

                if response.status == 200:
                    self._health_status = "healthy"
                    self._consecutive_errors = 0
                    return {
                        "status": "healthy",
                        "latency_ms": latency_ms,
                        "timestamp": self._last_health_check.isoformat(),
                    }
                else:
                    self._consecutive_errors += 1
                    status = "degraded" if self._consecutive_errors < self._error_threshold else "unhealthy"
                    self._health_status = status
                    return {
                        "status": status,
                        "error": f"HTTP {response.status}",
                        "consecutive_errors": self._consecutive_errors,
                        "timestamp": self._last_health_check.isoformat(),
                    }

        except Exception as e:
            self._consecutive_errors += 1
            status = "degraded" if self._consecutive_errors < self._error_threshold else "unhealthy"
            self._health_status = status

            # Publish health event
            if self.event_bus:
                await self.event_bus.publish_event(
                    event_type="provider.status",
                    data={
                        "provider": "epic",
                        "status": status,
                        "error": str(e),
                        "consecutive_errors": self._consecutive_errors,
                    },
                    session_id="system",
                    source_engine="integration",
                )

            return {
                "status": status,
                "error": str(e),
                "consecutive_errors": self._consecutive_errors,
                "timestamp": self._last_health_check.isoformat(),
            }

    def get_health_status(self) -> Dict[str, Any]:
        """Get current health status"""
        return {
            "status": self._health_status,
            "consecutive_errors": self._consecutive_errors,
            "last_check": (self._last_health_check.isoformat() if self._last_health_check else None),
            "environment": self.epic_config.environment.value,
        }

    def is_healthy(self) -> bool:
        """Check if adapter is healthy"""
        return self._health_status == "healthy"

    def is_available(self) -> bool:
        """Check if adapter is available (healthy or degraded)"""
        return self._health_status in ("healthy", "degraded")

    # =========================================================================
    # Audit Integration
    # =========================================================================

    async def _request(
        self,
        method: str,
        url: str,
        resource_type: str,
        operation: str,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Override to add audit logging"""
        result = await super()._request(method, url, resource_type, operation, params, data)

        # Log EHR access
        if self.audit_service and result is not None:
            # Extract patient ID if available
            patient_id = None
            if params and "patient" in params:
                patient_id = params["patient"]
            elif result and isinstance(result, dict):
                if result.get("resourceType") == "Patient":
                    patient_id = result.get("id")
                elif result.get("subject", {}).get("reference"):
                    ref = result["subject"]["reference"]
                    if ref.startswith("Patient/"):
                        patient_id = ref.split("/")[1]

            try:
                await self.audit_service.log_ehr_access(
                    user_id="system",  # Would be passed from context
                    session_id="",  # Would be passed from context
                    action="read",
                    resource_type=resource_type,
                    resource_id=patient_id,
                    details={
                        "operation": operation,
                        "provider": "epic",
                        "environment": self.epic_config.environment.value,
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to log EHR access: {e}")

        return result


# ==============================================================================
# Factory Function
# ==============================================================================


def create_epic_adapter(
    environment: str = "sandbox",
    client_id: Optional[str] = None,
    private_key_path: Optional[str] = None,
    base_url: Optional[str] = None,
    token_url: Optional[str] = None,
    event_bus=None,
    audit_service=None,
) -> EpicAdapter:
    """
    Factory function to create Epic adapter.

    Reads configuration from environment variables if not provided.

    Environment Variables:
        EPIC_ENVIRONMENT: sandbox or production
        EPIC_CLIENT_ID: OAuth2 client ID
        EPIC_PRIVATE_KEY_PATH: Path to private key file
        EPIC_PRIVATE_KEY: PEM-encoded private key (alternative)
        EPIC_BASE_URL: FHIR base URL (production only)
        EPIC_TOKEN_URL: Token endpoint URL (production only)
    """
    env = EpicEnvironment(environment or os.environ.get("EPIC_ENVIRONMENT", "sandbox"))

    config = EpicConfig(
        environment=env,
        client_id=client_id or os.environ.get("EPIC_CLIENT_ID", ""),
        private_key_path=private_key_path or os.environ.get("EPIC_PRIVATE_KEY_PATH"),
        private_key_pem=os.environ.get("EPIC_PRIVATE_KEY"),
        base_url=base_url or os.environ.get("EPIC_BASE_URL"),
        token_url=token_url or os.environ.get("EPIC_TOKEN_URL"),
    )

    return EpicAdapter(
        epic_config=config,
        event_bus=event_bus,
        audit_service=audit_service,
    )


def _parse_datetime_safe(value: str) -> Optional[datetime]:
    """Safely parse a datetime string"""
    if not value:
        return None

    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value.replace("+00:00", "Z"), fmt)
        except ValueError:
            continue

    return None


__all__ = [
    "EpicAdapter",
    "EpicConfig",
    "EpicEnvironment",
    "EpicToken",
    "create_epic_adapter",
]
