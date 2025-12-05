"""
SMART on FHIR Authentication Service - v4.2.0

Implements SMART on FHIR OAuth 2.0 authorization for healthcare EHR access.

Features:
- SMART on FHIR launch flow (EHR launch and standalone launch)
- OAuth 2.0 authorization code flow with PKCE
- Token management (access, refresh, ID tokens)
- Scope management for clinical data access
- Backend services authentication (client credentials)
- Token caching and automatic refresh

Standards:
- SMART App Launch Framework v2.0
- OAuth 2.0 (RFC 6749)
- PKCE (RFC 7636)
- OpenID Connect Core 1.0

Reference: http://hl7.org/fhir/smart-app-launch/
"""

import asyncio
import base64
import hashlib
import logging
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlencode, urlparse

import aiohttp
import jwt
from app.core.config import settings

logger = logging.getLogger(__name__)


# ==============================================================================
# Enums and Constants
# ==============================================================================


class SMARTLaunchType(str, Enum):
    """SMART launch types"""

    EHR_LAUNCH = "ehr"  # Launched from within EHR
    STANDALONE = "standalone"  # Launched independently
    BACKEND_SERVICES = "backend"  # Server-to-server


class SMARTScope(str, Enum):
    """Standard SMART on FHIR scopes"""

    # User-level access
    USER_PATIENT_READ = "user/Patient.read"
    USER_OBSERVATION_READ = "user/Observation.read"
    USER_CONDITION_READ = "user/Condition.read"
    USER_MEDICATION_READ = "user/MedicationRequest.read"
    USER_ALLERGY_READ = "user/AllergyIntolerance.read"
    USER_PROCEDURE_READ = "user/Procedure.read"
    USER_ENCOUNTER_READ = "user/Encounter.read"

    # Patient-level access (patient-specific context)
    PATIENT_PATIENT_READ = "patient/Patient.read"
    PATIENT_OBSERVATION_READ = "patient/Observation.read"
    PATIENT_CONDITION_READ = "patient/Condition.read"
    PATIENT_MEDICATION_READ = "patient/MedicationRequest.read"
    PATIENT_ALLERGY_READ = "patient/AllergyIntolerance.read"
    PATIENT_PROCEDURE_READ = "patient/Procedure.read"

    # System-level access (backend services)
    SYSTEM_PATIENT_READ = "system/Patient.read"
    SYSTEM_ALL_READ = "system/*.read"

    # Launch context
    LAUNCH = "launch"
    LAUNCH_PATIENT = "launch/patient"
    LAUNCH_ENCOUNTER = "launch/encounter"

    # OpenID Connect
    OPENID = "openid"
    FHIRUSER = "fhirUser"
    PROFILE = "profile"

    # Offline access
    OFFLINE_ACCESS = "offline_access"


# Default clinical read scopes
DEFAULT_CLINICAL_SCOPES = [
    SMARTScope.USER_PATIENT_READ,
    SMARTScope.USER_OBSERVATION_READ,
    SMARTScope.USER_CONDITION_READ,
    SMARTScope.USER_MEDICATION_READ,
    SMARTScope.USER_ALLERGY_READ,
    SMARTScope.USER_PROCEDURE_READ,
    SMARTScope.OPENID,
    SMARTScope.FHIRUSER,
    SMARTScope.OFFLINE_ACCESS,
]


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class SMARTConfiguration:
    """SMART server configuration from .well-known/smart-configuration"""

    authorization_endpoint: str
    token_endpoint: str
    issuer: Optional[str] = None
    jwks_uri: Optional[str] = None
    registration_endpoint: Optional[str] = None
    management_endpoint: Optional[str] = None
    introspection_endpoint: Optional[str] = None
    revocation_endpoint: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)
    scopes_supported: List[str] = field(default_factory=list)
    response_types_supported: List[str] = field(default_factory=list)
    code_challenge_methods_supported: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SMARTConfiguration":
        return cls(
            authorization_endpoint=data.get("authorization_endpoint", ""),
            token_endpoint=data.get("token_endpoint", ""),
            issuer=data.get("issuer"),
            jwks_uri=data.get("jwks_uri"),
            registration_endpoint=data.get("registration_endpoint"),
            management_endpoint=data.get("management_endpoint"),
            introspection_endpoint=data.get("introspection_endpoint"),
            revocation_endpoint=data.get("revocation_endpoint"),
            capabilities=data.get("capabilities", []),
            scopes_supported=data.get("scopes_supported", []),
            response_types_supported=data.get("response_types_supported", []),
            code_challenge_methods_supported=data.get("code_challenge_methods_supported", []),
        )


@dataclass
class SMARTToken:
    """OAuth token response from SMART server"""

    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 3600
    refresh_token: Optional[str] = None
    scope: str = ""
    id_token: Optional[str] = None
    patient: Optional[str] = None  # Patient context from launch
    encounter: Optional[str] = None  # Encounter context from launch
    need_patient_banner: bool = False
    smart_style_url: Optional[str] = None

    # Internal tracking
    issued_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SMARTToken":
        return cls(
            access_token=data.get("access_token", ""),
            token_type=data.get("token_type", "Bearer"),
            expires_in=data.get("expires_in", 3600),
            refresh_token=data.get("refresh_token"),
            scope=data.get("scope", ""),
            id_token=data.get("id_token"),
            patient=data.get("patient"),
            encounter=data.get("encounter"),
            need_patient_banner=data.get("need_patient_banner", False),
            smart_style_url=data.get("smart_style_url"),
        )

    @property
    def expires_at(self) -> datetime:
        return self.issued_at + timedelta(seconds=self.expires_in)

    @property
    def is_expired(self) -> bool:
        # Consider expired 60 seconds before actual expiry
        return datetime.now(timezone.utc) >= (self.expires_at - timedelta(seconds=60))

    @property
    def granted_scopes(self) -> List[str]:
        return self.scope.split() if self.scope else []


@dataclass
class SMARTAuthState:
    """State for OAuth authorization flow"""

    state: str
    code_verifier: str
    code_challenge: str
    redirect_uri: str
    scopes: List[str]
    launch_type: SMARTLaunchType
    launch_token: Optional[str] = None  # For EHR launch
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_expired(self) -> bool:
        # State expires after 10 minutes
        return datetime.now(timezone.utc) > (self.created_at + timedelta(minutes=10))


@dataclass
class SMARTSession:
    """Active SMART session with tokens"""

    session_id: str
    fhir_server_url: str
    token: SMARTToken
    configuration: SMARTConfiguration
    launch_type: SMARTLaunchType
    user_id: Optional[str] = None
    patient_id: Optional[str] = None
    encounter_id: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "fhir_server_url": self.fhir_server_url,
            "launch_type": self.launch_type.value,
            "user_id": self.user_id,
            "patient_id": self.patient_id,
            "encounter_id": self.encounter_id,
            "scopes": self.token.granted_scopes,
            "expires_at": self.token.expires_at.isoformat(),
            "created_at": self.created_at.isoformat(),
        }


# ==============================================================================
# SMART on FHIR Service
# ==============================================================================


class SMARTAuthService:
    """
    SMART on FHIR Authentication Service

    Handles OAuth 2.0 authorization flows for FHIR server access.

    Usage:
        service = SMARTAuthService(
            client_id="my-app",
            client_secret="secret",  # Optional for confidential clients
            redirect_uri="https://myapp.com/callback",
        )

        # Standalone launch
        auth_url = await service.get_authorization_url(
            fhir_server="https://fhir.epic.com/R4",
            scopes=[SMARTScope.USER_PATIENT_READ, ...],
        )
        # Redirect user to auth_url

        # Handle callback
        session = await service.handle_authorization_callback(
            code="authorization_code",
            state="state_from_url",
        )

        # Use session
        token = session.token.access_token
    """

    def __init__(
        self,
        client_id: str,
        client_secret: Optional[str] = None,
        redirect_uri: str = "",
        default_scopes: Optional[List[SMARTScope]] = None,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.default_scopes = default_scopes or DEFAULT_CLINICAL_SCOPES

        # Caches
        self._config_cache: Dict[str, SMARTConfiguration] = {}
        self._auth_states: Dict[str, SMARTAuthState] = {}
        self._sessions: Dict[str, SMARTSession] = {}

        self._session: Optional[aiohttp.ClientSession] = None
        self._lock = asyncio.Lock()

        logger.info(f"SMARTAuthService initialized for client: {client_id}")

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                headers={"Accept": "application/json"},
            )
        return self._session

    async def close(self) -> None:
        """Close HTTP session"""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    # =========================================================================
    # Configuration Discovery
    # =========================================================================

    async def discover_configuration(
        self,
        fhir_server_url: str,
        force_refresh: bool = False,
    ) -> SMARTConfiguration:
        """
        Discover SMART configuration from FHIR server.

        Fetches from .well-known/smart-configuration or falls back to
        metadata endpoint.
        """
        if not force_refresh and fhir_server_url in self._config_cache:
            return self._config_cache[fhir_server_url]

        session = await self._get_session()

        # Try .well-known/smart-configuration first
        smart_config_url = f"{fhir_server_url.rstrip('/')}/.well-known/smart-configuration"

        try:
            async with session.get(smart_config_url) as response:
                if response.status == 200:
                    data = await response.json()
                    config = SMARTConfiguration.from_dict(data)
                    self._config_cache[fhir_server_url] = config
                    logger.info(f"Discovered SMART config from: {smart_config_url}")
                    return config
        except Exception as e:
            logger.warning(f"Failed to fetch smart-configuration: {e}")

        # Fall back to metadata endpoint
        metadata_url = f"{fhir_server_url.rstrip('/')}/metadata"

        try:
            async with session.get(metadata_url) as response:
                if response.status == 200:
                    data = await response.json()
                    config = self._parse_capability_statement(data)
                    self._config_cache[fhir_server_url] = config
                    logger.info(f"Discovered SMART config from metadata: {metadata_url}")
                    return config
        except Exception as e:
            logger.error(f"Failed to fetch metadata: {e}")
            raise RuntimeError(f"Could not discover SMART configuration for {fhir_server_url}")

        raise RuntimeError(f"No SMART configuration available for {fhir_server_url}")

    def _parse_capability_statement(self, data: Dict[str, Any]) -> SMARTConfiguration:
        """Parse OAuth endpoints from FHIR CapabilityStatement"""
        auth_endpoint = ""
        token_endpoint = ""

        # Look in rest.security.extension
        for rest in data.get("rest", []):
            security = rest.get("security", {})
            for ext in security.get("extension", []):
                if ext.get("url") == "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris":
                    for sub_ext in ext.get("extension", []):
                        if sub_ext.get("url") == "authorize":
                            auth_endpoint = sub_ext.get("valueUri", "")
                        elif sub_ext.get("url") == "token":
                            token_endpoint = sub_ext.get("valueUri", "")

        return SMARTConfiguration(
            authorization_endpoint=auth_endpoint,
            token_endpoint=token_endpoint,
        )

    # =========================================================================
    # Authorization Flow
    # =========================================================================

    async def get_authorization_url(
        self,
        fhir_server_url: str,
        scopes: Optional[List[SMARTScope]] = None,
        launch_type: SMARTLaunchType = SMARTLaunchType.STANDALONE,
        launch_token: Optional[str] = None,
        aud: Optional[str] = None,
        redirect_uri: Optional[str] = None,
    ) -> str:
        """
        Generate authorization URL for SMART launch.

        Args:
            fhir_server_url: FHIR server base URL
            scopes: Requested scopes (defaults to clinical read scopes)
            launch_type: Type of launch (standalone or EHR)
            launch_token: Launch token from EHR (for EHR launch)
            aud: Audience (defaults to fhir_server_url)
            redirect_uri: Override default redirect URI

        Returns:
            Authorization URL to redirect user to
        """
        # Discover configuration
        config = await self.discover_configuration(fhir_server_url)

        # Generate PKCE challenge
        code_verifier = secrets.token_urlsafe(64)
        code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).decode().rstrip("=")

        # Generate state
        state = secrets.token_urlsafe(32)

        # Prepare scopes
        scope_list = scopes or self.default_scopes
        scope_strings = [s.value if isinstance(s, SMARTScope) else s for s in scope_list]

        # Add launch scope for EHR launch
        if launch_type == SMARTLaunchType.EHR_LAUNCH and SMARTScope.LAUNCH.value not in scope_strings:
            scope_strings.insert(0, SMARTScope.LAUNCH.value)

        # Store auth state
        auth_state = SMARTAuthState(
            state=state,
            code_verifier=code_verifier,
            code_challenge=code_challenge,
            redirect_uri=redirect_uri or self.redirect_uri,
            scopes=scope_strings,
            launch_type=launch_type,
            launch_token=launch_token,
        )

        async with self._lock:
            self._auth_states[state] = auth_state

        # Build authorization URL
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": auth_state.redirect_uri,
            "scope": " ".join(scope_strings),
            "state": state,
            "aud": aud or fhir_server_url,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }

        # Add launch token for EHR launch
        if launch_token:
            params["launch"] = launch_token

        auth_url = f"{config.authorization_endpoint}?{urlencode(params)}"

        logger.info(f"Generated authorization URL for {fhir_server_url}")
        return auth_url

    async def handle_authorization_callback(
        self,
        code: str,
        state: str,
        fhir_server_url: str,
    ) -> SMARTSession:
        """
        Handle OAuth callback and exchange code for tokens.

        Args:
            code: Authorization code from callback
            state: State parameter from callback
            fhir_server_url: FHIR server URL

        Returns:
            SMARTSession with tokens and context
        """
        # Validate state
        async with self._lock:
            auth_state = self._auth_states.pop(state, None)

        if not auth_state:
            raise ValueError("Invalid or expired state parameter")

        if auth_state.is_expired:
            raise ValueError("Authorization state expired")

        # Get configuration
        config = await self.discover_configuration(fhir_server_url)

        # Exchange code for tokens
        token = await self._exchange_code(
            token_endpoint=config.token_endpoint,
            code=code,
            code_verifier=auth_state.code_verifier,
            redirect_uri=auth_state.redirect_uri,
        )

        # Create session
        session_id = secrets.token_urlsafe(16)
        session = SMARTSession(
            session_id=session_id,
            fhir_server_url=fhir_server_url,
            token=token,
            configuration=config,
            launch_type=auth_state.launch_type,
            patient_id=token.patient,
            encounter_id=token.encounter,
        )

        # Parse ID token for user info if present
        if token.id_token:
            try:
                # Decode without verification for user info extraction
                # (verification should be done in production)
                claims = jwt.decode(token.id_token, options={"verify_signature": False})
                session.user_id = claims.get("sub") or claims.get("fhirUser")
            except Exception as e:
                logger.warning(f"Could not decode ID token: {e}")

        async with self._lock:
            self._sessions[session_id] = session

        logger.info(
            f"Created SMART session: {session_id}",
            extra={
                "fhir_server": fhir_server_url,
                "patient_id": session.patient_id,
                "scopes": token.granted_scopes,
            },
        )

        return session

    async def _exchange_code(
        self,
        token_endpoint: str,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> SMARTToken:
        """Exchange authorization code for tokens"""
        session = await self._get_session()

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.client_id,
            "code_verifier": code_verifier,
        }

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        # Add client authentication for confidential clients
        if self.client_secret:
            credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"

        async with session.post(token_endpoint, data=data, headers=headers) as response:
            if response.status != 200:
                error_text = await response.text()
                logger.error(f"Token exchange failed: {response.status} - {error_text}")
                raise RuntimeError(f"Token exchange failed: {error_text}")

            token_data = await response.json()
            return SMARTToken.from_dict(token_data)

    # =========================================================================
    # Token Management
    # =========================================================================

    async def refresh_token(self, session_id: str) -> SMARTToken:
        """
        Refresh access token using refresh token.

        Args:
            session_id: Session ID

        Returns:
            New SMARTToken
        """
        async with self._lock:
            session = self._sessions.get(session_id)

        if not session:
            raise ValueError(f"Session not found: {session_id}")

        if not session.token.refresh_token:
            raise ValueError("No refresh token available")

        http_session = await self._get_session()

        data = {
            "grant_type": "refresh_token",
            "refresh_token": session.token.refresh_token,
            "client_id": self.client_id,
        }

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        if self.client_secret:
            credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"

        async with http_session.post(session.configuration.token_endpoint, data=data, headers=headers) as response:
            if response.status != 200:
                error_text = await response.text()
                logger.error(f"Token refresh failed: {response.status} - {error_text}")
                raise RuntimeError(f"Token refresh failed: {error_text}")

            token_data = await response.json()
            new_token = SMARTToken.from_dict(token_data)

            # Preserve refresh token if not returned
            if not new_token.refresh_token:
                new_token.refresh_token = session.token.refresh_token

            # Preserve context
            if not new_token.patient:
                new_token.patient = session.token.patient
            if not new_token.encounter:
                new_token.encounter = session.token.encounter

            # Update session
            async with self._lock:
                session.token = new_token
                session.last_used_at = datetime.now(timezone.utc)

            logger.info(f"Refreshed token for session: {session_id}")
            return new_token

    async def get_access_token(self, session_id: str) -> str:
        """
        Get current access token, refreshing if needed.

        Args:
            session_id: Session ID

        Returns:
            Valid access token
        """
        async with self._lock:
            session = self._sessions.get(session_id)

        if not session:
            raise ValueError(f"Session not found: {session_id}")

        # Refresh if expired
        if session.token.is_expired:
            if session.token.refresh_token:
                await self.refresh_token(session_id)
                async with self._lock:
                    session = self._sessions[session_id]
            else:
                raise RuntimeError("Token expired and no refresh token available")

        # Update last used
        session.last_used_at = datetime.now(timezone.utc)

        return session.token.access_token

    # =========================================================================
    # Backend Services (Client Credentials)
    # =========================================================================

    async def authenticate_backend_service(
        self,
        fhir_server_url: str,
        scopes: Optional[List[SMARTScope]] = None,
        private_key_jwt: Optional[str] = None,
    ) -> SMARTSession:
        """
        Authenticate as a backend service using client credentials.

        For server-to-server communication without user interaction.

        Args:
            fhir_server_url: FHIR server URL
            scopes: Requested scopes (defaults to system/*.read)
            private_key_jwt: JWT assertion for asymmetric auth (optional)

        Returns:
            SMARTSession with access token
        """
        config = await self.discover_configuration(fhir_server_url)

        http_session = await self._get_session()

        # Prepare scopes
        scope_list = scopes or [SMARTScope.SYSTEM_ALL_READ]
        scope_string = " ".join(s.value if isinstance(s, SMARTScope) else s for s in scope_list)

        data = {
            "grant_type": "client_credentials",
            "scope": scope_string,
        }

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        if private_key_jwt:
            # Use JWT assertion for asymmetric authentication
            data["client_assertion_type"] = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
            data["client_assertion"] = private_key_jwt
        elif self.client_secret:
            # Use basic auth for symmetric authentication
            credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"
            data["client_id"] = self.client_id
        else:
            raise ValueError("Either client_secret or private_key_jwt required for backend auth")

        async with http_session.post(config.token_endpoint, data=data, headers=headers) as response:
            if response.status != 200:
                error_text = await response.text()
                logger.error(f"Backend auth failed: {response.status} - {error_text}")
                raise RuntimeError(f"Backend authentication failed: {error_text}")

            token_data = await response.json()
            token = SMARTToken.from_dict(token_data)

        # Create session
        session_id = secrets.token_urlsafe(16)
        session = SMARTSession(
            session_id=session_id,
            fhir_server_url=fhir_server_url,
            token=token,
            configuration=config,
            launch_type=SMARTLaunchType.BACKEND_SERVICES,
        )

        async with self._lock:
            self._sessions[session_id] = session

        logger.info(f"Backend service authenticated: {session_id}")
        return session

    # =========================================================================
    # Session Management
    # =========================================================================

    def get_session(self, session_id: str) -> Optional[SMARTSession]:
        """Get session by ID"""
        return self._sessions.get(session_id)

    async def revoke_session(self, session_id: str) -> bool:
        """
        Revoke session and its tokens.

        Args:
            session_id: Session ID to revoke

        Returns:
            True if revoked successfully
        """
        async with self._lock:
            session = self._sessions.pop(session_id, None)

        if not session:
            return False

        # Try to revoke token at server if endpoint available
        if session.configuration.revocation_endpoint:
            try:
                http_session = await self._get_session()
                data = {
                    "token": session.token.access_token,
                    "token_type_hint": "access_token",
                }

                if self.client_secret:
                    credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
                    headers = {"Authorization": f"Basic {credentials}"}
                else:
                    headers = {}
                    data["client_id"] = self.client_id

                async with http_session.post(
                    session.configuration.revocation_endpoint,
                    data=data,
                    headers=headers,
                ) as response:
                    if response.status == 200:
                        logger.info(f"Token revoked at server for session: {session_id}")
            except Exception as e:
                logger.warning(f"Failed to revoke token at server: {e}")

        logger.info(f"Session revoked: {session_id}")
        return True

    def list_sessions(self) -> List[Dict[str, Any]]:
        """List all active sessions"""
        return [s.to_dict() for s in self._sessions.values()]

    async def cleanup_expired_sessions(self) -> int:
        """Remove expired sessions"""
        expired = []

        async with self._lock:
            for session_id, session in self._sessions.items():
                if session.token.is_expired and not session.token.refresh_token:
                    expired.append(session_id)

            for session_id in expired:
                del self._sessions[session_id]

        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")

        return len(expired)


# ==============================================================================
# Global Instance
# ==============================================================================


_smart_auth_service: Optional[SMARTAuthService] = None


def get_smart_auth_service() -> SMARTAuthService:
    """Get or create SMART auth service instance"""
    global _smart_auth_service

    if _smart_auth_service is None:
        _smart_auth_service = SMARTAuthService(
            client_id=getattr(settings, "SMART_CLIENT_ID", "voiceassist"),
            client_secret=getattr(settings, "SMART_CLIENT_SECRET", None),
            redirect_uri=getattr(settings, "SMART_REDIRECT_URI", ""),
        )

    return _smart_auth_service


__all__ = [
    "SMARTAuthService",
    "SMARTConfiguration",
    "SMARTToken",
    "SMARTSession",
    "SMARTAuthState",
    "SMARTLaunchType",
    "SMARTScope",
    "get_smart_auth_service",
]
