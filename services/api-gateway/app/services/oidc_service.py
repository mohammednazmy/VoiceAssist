"""
OpenID Connect (OIDC) Authentication Service

Provides SSO authentication with Nextcloud and other OIDC providers.

Features:
- Authorization code flow with PKCE
- ID token validation with JWKS
- Token refresh handling
- Session management
- Multi-provider support (Nextcloud, Google, Microsoft)

Security:
- PKCE for code exchange
- State parameter for CSRF protection
- Nonce for replay attack prevention
- Token encryption at rest
"""

import base64
import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from app.core.config import settings
from app.core.logging import get_logger
from jose import jwt
from jose.exceptions import JWTError

logger = get_logger(__name__)


class OIDCProvider(str, Enum):
    """Supported OIDC providers."""

    NEXTCLOUD = "nextcloud"
    GOOGLE = "google"
    MICROSOFT = "microsoft"
    CUSTOM = "custom"


@dataclass
class OIDCProviderConfig:
    """Configuration for an OIDC provider."""

    provider: OIDCProvider
    issuer: str
    client_id: str
    client_secret: str
    redirect_uri: str
    scopes: List[str] = field(default_factory=lambda: ["openid", "profile", "email"])

    # Endpoints (auto-discovered or manual)
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    jwks_uri: Optional[str] = None
    end_session_endpoint: Optional[str] = None

    # Provider-specific settings
    additional_params: Dict[str, str] = field(default_factory=dict)


@dataclass
class OIDCTokens:
    """OIDC token response."""

    access_token: str
    token_type: str = "Bearer"
    id_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_in: int = 3600
    scope: Optional[str] = None
    issued_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def expires_at(self) -> datetime:
        """Calculate token expiration time."""
        return self.issued_at + timedelta(seconds=self.expires_in)

    @property
    def is_expired(self) -> bool:
        """Check if token is expired."""
        return datetime.utcnow() >= self.expires_at


@dataclass
class OIDCClaims:
    """Standard OIDC ID token claims."""

    sub: str  # Subject identifier
    iss: str  # Issuer
    aud: str  # Audience
    exp: int  # Expiration time
    iat: int  # Issued at
    nonce: Optional[str] = None

    # Optional standard claims
    email: Optional[str] = None
    email_verified: Optional[bool] = None
    name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    preferred_username: Optional[str] = None
    picture: Optional[str] = None
    locale: Optional[str] = None

    # Provider-specific claims
    extra_claims: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NextcloudUser:
    """Nextcloud user info from OCS API."""

    id: str
    display_name: str
    email: Optional[str] = None
    groups: List[str] = field(default_factory=list)
    quota: Optional[Dict[str, Any]] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    twitter: Optional[str] = None
    language: Optional[str] = None
    backend: Optional[str] = None
    enabled: bool = True


@dataclass
class AuthorizationRequest:
    """Authorization request parameters."""

    state: str
    nonce: str
    code_verifier: Optional[str] = None  # For PKCE
    code_challenge: Optional[str] = None
    redirect_uri: str = ""
    provider: OIDCProvider = OIDCProvider.NEXTCLOUD
    created_at: datetime = field(default_factory=datetime.utcnow)


class OIDCService:
    """
    OpenID Connect authentication service.

    Supports multiple OIDC providers with automatic discovery
    and secure token handling.
    """

    # Well-known configuration path
    WELL_KNOWN_PATH = "/.well-known/openid-configuration"

    def __init__(self):
        self.providers: Dict[OIDCProvider, OIDCProviderConfig] = {}
        self._jwks_cache: Dict[str, Dict] = {}
        self._jwks_cache_time: Dict[str, datetime] = {}
        self._discovery_cache: Dict[str, Dict] = {}
        self._pending_requests: Dict[str, AuthorizationRequest] = {}

    def register_provider(self, config: OIDCProviderConfig) -> None:
        """Register an OIDC provider configuration."""
        self.providers[config.provider] = config
        logger.info(f"Registered OIDC provider: {config.provider.value}")

    def register_nextcloud(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> None:
        """Register Nextcloud as OIDC provider with known endpoints."""
        config = OIDCProviderConfig(
            provider=OIDCProvider.NEXTCLOUD,
            issuer=base_url,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scopes=["openid", "profile", "email"],
            # Nextcloud OAuth2/OIDC endpoints
            authorization_endpoint=f"{base_url}/apps/oauth2/authorize",
            token_endpoint=f"{base_url}/apps/oauth2/api/v1/token",
            userinfo_endpoint=f"{base_url}/ocs/v2.php/cloud/user",
            jwks_uri=f"{base_url}/apps/oidc/.well-known/jwks.json",
        )
        self.register_provider(config)

    def register_google(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> None:
        """Register Google as OIDC provider."""
        config = OIDCProviderConfig(
            provider=OIDCProvider.GOOGLE,
            issuer="https://accounts.google.com",
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scopes=["openid", "profile", "email"],
            # Google OIDC endpoints
            authorization_endpoint="https://accounts.google.com/o/oauth2/v2/auth",
            token_endpoint="https://oauth2.googleapis.com/token",
            userinfo_endpoint="https://openidconnect.googleapis.com/v1/userinfo",
            jwks_uri="https://www.googleapis.com/oauth2/v3/certs",
        )
        self.register_provider(config)

    def register_microsoft(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> None:
        """Register Microsoft/Azure AD as OIDC provider."""
        base_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0"
        config = OIDCProviderConfig(
            provider=OIDCProvider.MICROSOFT,
            issuer=f"https://login.microsoftonline.com/{tenant_id}/v2.0",
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            scopes=["openid", "profile", "email", "offline_access"],
            authorization_endpoint=f"{base_url}/authorize",
            token_endpoint=f"{base_url}/token",
            userinfo_endpoint="https://graph.microsoft.com/oidc/userinfo",
            jwks_uri=f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys",
        )
        self.register_provider(config)

    async def discover_configuration(
        self,
        issuer: str,
    ) -> Dict[str, Any]:
        """Discover OIDC configuration from well-known endpoint."""
        if issuer in self._discovery_cache:
            return self._discovery_cache[issuer]

        discovery_url = f"{issuer.rstrip('/')}{self.WELL_KNOWN_PATH}"

        async with httpx.AsyncClient() as client:
            response = await client.get(discovery_url, timeout=10.0)
            response.raise_for_status()
            config = response.json()

        self._discovery_cache[issuer] = config
        logger.info(f"Discovered OIDC configuration for {issuer}")
        return config

    def generate_state(self) -> str:
        """Generate cryptographically secure state parameter."""
        return secrets.token_urlsafe(32)

    def generate_nonce(self) -> str:
        """Generate cryptographically secure nonce."""
        return secrets.token_urlsafe(32)

    def generate_pkce(self) -> tuple[str, str]:
        """
        Generate PKCE code verifier and challenge.

        Returns:
            Tuple of (code_verifier, code_challenge)
        """
        # Generate random 43-128 character verifier
        code_verifier = secrets.token_urlsafe(64)

        # SHA256 hash and base64url encode for challenge (RFC 7636)
        digest = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()

        return code_verifier, code_challenge

    def create_authorization_request(
        self,
        provider: OIDCProvider = OIDCProvider.NEXTCLOUD,
        use_pkce: bool = True,
    ) -> AuthorizationRequest:
        """Create a new authorization request with security parameters."""
        code_verifier = None
        code_challenge = None

        if use_pkce:
            code_verifier, code_challenge = self.generate_pkce()

        config = self.providers.get(provider)
        redirect_uri = config.redirect_uri if config else ""
        auth_request = AuthorizationRequest(
            state=self.generate_state(),
            nonce=self.generate_nonce(),
            code_verifier=code_verifier,
            code_challenge=code_challenge,
            redirect_uri=redirect_uri,
            provider=provider,
        )

        # Track pending request for CSRF protection and nonce validation
        self._pending_requests[auth_request.state] = auth_request
        self._cleanup_expired_requests()

        return auth_request

    async def get_authorization_url(
        self,
        auth_request: AuthorizationRequest,
    ) -> str:
        """
        Generate authorization URL for redirect.

        Args:
            auth_request: Authorization request parameters

        Returns:
            Full authorization URL for redirect
        """
        config = self.providers.get(auth_request.provider)
        if not config:
            raise ValueError(f"Provider not registered: {auth_request.provider}")

        # Ensure the state/nonce pair matches a pending request
        pending = self._pending_requests.get(auth_request.state)
        if not pending or pending.nonce != auth_request.nonce:
            raise ValueError("Authorization request missing or has expired")

        params = {
            "response_type": "code",
            "client_id": config.client_id,
            "redirect_uri": config.redirect_uri,
            "scope": " ".join(config.scopes),
            "state": auth_request.state,
            "nonce": auth_request.nonce,
        }

        # Add PKCE challenge if available
        if auth_request.code_challenge:
            params["code_challenge"] = auth_request.code_challenge
            params["code_challenge_method"] = "S256"

        # Add provider-specific parameters
        params.update(config.additional_params)

        endpoint = config.authorization_endpoint
        if not endpoint:
            discovery = await self.discover_configuration(config.issuer)
            endpoint = discovery["authorization_endpoint"]

        return f"{endpoint}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        auth_request: AuthorizationRequest,
    ) -> OIDCTokens:
        """
        Exchange authorization code for tokens.

        Args:
            code: Authorization code from callback
            auth_request: Original authorization request

        Returns:
            OIDCTokens with access_token, id_token, etc.
        """
        config = self.providers.get(auth_request.provider)
        if not config:
            raise ValueError(f"Provider not registered: {auth_request.provider}")

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": config.redirect_uri,
            "client_id": config.client_id,
            "client_secret": config.client_secret,
        }

        # Add PKCE verifier if used
        if auth_request.code_verifier:
            data["code_verifier"] = auth_request.code_verifier

        endpoint = config.token_endpoint
        if not endpoint:
            discovery = await self.discover_configuration(config.issuer)
            endpoint = discovery["token_endpoint"]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                endpoint,
                data=data,
                timeout=30.0,
            )
            response.raise_for_status()
            token_data = response.json()

        return OIDCTokens(
            access_token=token_data["access_token"],
            token_type=token_data.get("token_type", "Bearer"),
            id_token=token_data.get("id_token"),
            refresh_token=token_data.get("refresh_token"),
            expires_in=token_data.get("expires_in", 3600),
            scope=token_data.get("scope"),
        )

    def _cleanup_expired_requests(self) -> None:
        """Remove stale authorization requests (older than 15 minutes)."""
        cutoff = datetime.utcnow() - timedelta(minutes=15)
        expired = [state for state, req in self._pending_requests.items() if req.created_at < cutoff]
        for state in expired:
            self._pending_requests.pop(state, None)

    def pop_pending_request(self, state: str) -> Optional[AuthorizationRequest]:
        """Retrieve and remove a pending authorization request by state."""
        self._cleanup_expired_requests()
        return self._pending_requests.pop(state, None)

    async def complete_authorization_flow(
        self, code: str, state: str, expected_nonce: Optional[str] = None
    ) -> tuple[OIDCTokens, Optional[OIDCClaims]]:
        """Helper to validate state/nonce and exchange an authorization code."""

        auth_request = self.pop_pending_request(state)
        if not auth_request:
            raise ValueError("Unknown or expired state")

        tokens = await self.exchange_code(code, auth_request)

        claims: Optional[OIDCClaims] = None
        if tokens.id_token:
            nonce = expected_nonce or auth_request.nonce
            claims = await self.validate_id_token(tokens.id_token, nonce, auth_request.provider)

        return tokens, claims

    async def refresh_tokens(
        self,
        refresh_token: str,
        provider: OIDCProvider = OIDCProvider.NEXTCLOUD,
    ) -> OIDCTokens:
        """
        Refresh access token using refresh token.

        Args:
            refresh_token: Refresh token
            provider: OIDC provider

        Returns:
            New OIDCTokens
        """
        config = self.providers.get(provider)
        if not config:
            raise ValueError(f"Provider not registered: {provider}")

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": config.client_id,
            "client_secret": config.client_secret,
        }

        endpoint = config.token_endpoint
        if not endpoint:
            discovery = await self.discover_configuration(config.issuer)
            endpoint = discovery["token_endpoint"]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                endpoint,
                data=data,
                timeout=30.0,
            )
            response.raise_for_status()
            token_data = response.json()

        return OIDCTokens(
            access_token=token_data["access_token"],
            token_type=token_data.get("token_type", "Bearer"),
            id_token=token_data.get("id_token"),
            refresh_token=token_data.get("refresh_token", refresh_token),
            expires_in=token_data.get("expires_in", 3600),
            scope=token_data.get("scope"),
        )

    async def _get_jwks(self, provider: OIDCProvider) -> Dict:
        """Fetch and cache JWKS for provider."""
        config = self.providers.get(provider)
        if not config:
            raise ValueError(f"Provider not registered: {provider}")

        cache_key = config.issuer

        # Check cache (valid for 1 hour)
        if cache_key in self._jwks_cache:
            cache_time = self._jwks_cache_time.get(cache_key)
            if cache_time and datetime.utcnow() - cache_time < timedelta(hours=1):
                return self._jwks_cache[cache_key]

        jwks_uri = config.jwks_uri
        if not jwks_uri:
            discovery = await self.discover_configuration(config.issuer)
            jwks_uri = discovery["jwks_uri"]

        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_uri, timeout=10.0)
            response.raise_for_status()
            jwks = response.json()

        self._jwks_cache[cache_key] = jwks
        self._jwks_cache_time[cache_key] = datetime.utcnow()

        return jwks

    async def validate_id_token(
        self,
        id_token: str,
        nonce: str,
        provider: OIDCProvider = OIDCProvider.NEXTCLOUD,
    ) -> OIDCClaims:
        """
        Validate and decode ID token.

        Args:
            id_token: JWT ID token
            nonce: Expected nonce value
            provider: OIDC provider

        Returns:
            Validated OIDCClaims

        Raises:
            ValueError: If token is invalid
        """
        config = self.providers.get(provider)
        if not config:
            raise ValueError(f"Provider not registered: {provider}")

        # Get JWKS
        jwks = await self._get_jwks(provider)

        try:
            # Decode and validate
            claims = jwt.decode(
                id_token,
                jwks,
                algorithms=["RS256", "ES256"],
                audience=config.client_id,
                issuer=config.issuer,
            )
        except JWTError as e:
            logger.error(f"ID token validation failed: {e}")
            raise ValueError(f"Invalid ID token: {e}")

        # Verify nonce
        if claims.get("nonce") != nonce:
            raise ValueError("Invalid nonce - possible replay attack")

        return OIDCClaims(
            sub=claims["sub"],
            iss=claims["iss"],
            aud=claims["aud"] if isinstance(claims["aud"], str) else claims["aud"][0],
            exp=claims["exp"],
            iat=claims["iat"],
            nonce=claims.get("nonce"),
            email=claims.get("email"),
            email_verified=claims.get("email_verified"),
            name=claims.get("name"),
            given_name=claims.get("given_name"),
            family_name=claims.get("family_name"),
            preferred_username=claims.get("preferred_username"),
            picture=claims.get("picture"),
            locale=claims.get("locale"),
            extra_claims={
                k: v
                for k, v in claims.items()
                if k
                not in [
                    "sub",
                    "iss",
                    "aud",
                    "exp",
                    "iat",
                    "nonce",
                    "email",
                    "email_verified",
                    "name",
                    "given_name",
                    "family_name",
                    "preferred_username",
                    "picture",
                    "locale",
                ]
            },
        )

    async def get_user_info(
        self,
        access_token: str,
        provider: OIDCProvider = OIDCProvider.NEXTCLOUD,
    ) -> Dict[str, Any]:
        """
        Get user info from provider's userinfo endpoint.

        Args:
            access_token: Valid access token
            provider: OIDC provider

        Returns:
            User info dictionary
        """
        config = self.providers.get(provider)
        if not config:
            raise ValueError(f"Provider not registered: {provider}")

        endpoint = config.userinfo_endpoint
        if not endpoint:
            discovery = await self.discover_configuration(config.issuer)
            endpoint = discovery["userinfo_endpoint"]

        headers = {"Authorization": f"Bearer {access_token}"}

        # Nextcloud requires OCS-APIRequest header
        if provider == OIDCProvider.NEXTCLOUD:
            headers["OCS-APIRequest"] = "true"
            headers["Accept"] = "application/json"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                endpoint,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            return response.json()

    async def get_nextcloud_user(
        self,
        access_token: str,
    ) -> NextcloudUser:
        """
        Get Nextcloud user info from OCS API.

        Args:
            access_token: Valid Nextcloud access token

        Returns:
            NextcloudUser object
        """
        user_info = await self.get_user_info(access_token, OIDCProvider.NEXTCLOUD)

        # Nextcloud OCS API wraps data in ocs.data
        if "ocs" in user_info:
            user_data = user_info["ocs"]["data"]
        else:
            user_data = user_info

        return NextcloudUser(
            id=user_data.get("id", ""),
            display_name=user_data.get("displayname", user_data.get("display-name", "")),
            email=user_data.get("email"),
            groups=user_data.get("groups", []),
            quota=user_data.get("quota"),
            phone=user_data.get("phone"),
            address=user_data.get("address"),
            website=user_data.get("website"),
            twitter=user_data.get("twitter"),
            language=user_data.get("language"),
            backend=user_data.get("backend"),
            enabled=user_data.get("enabled", True),
        )

    async def logout(
        self,
        id_token: str,
        provider: OIDCProvider = OIDCProvider.NEXTCLOUD,
        post_logout_redirect_uri: Optional[str] = None,
    ) -> Optional[str]:
        """
        Get logout URL for provider (if supported).

        Args:
            id_token: ID token hint
            provider: OIDC provider
            post_logout_redirect_uri: Where to redirect after logout

        Returns:
            Logout URL or None if not supported
        """
        config = self.providers.get(provider)
        if not config:
            return None

        endpoint = config.end_session_endpoint
        if not endpoint:
            try:
                discovery = await self.discover_configuration(config.issuer)
                endpoint = discovery.get("end_session_endpoint")
            except Exception:
                return None

        if not endpoint:
            return None

        params = {"id_token_hint": id_token}
        if post_logout_redirect_uri:
            params["post_logout_redirect_uri"] = post_logout_redirect_uri

        return f"{endpoint}?{urlencode(params)}"


# Singleton instance
oidc_service = OIDCService()


def get_oidc_service() -> OIDCService:
    """Get the OIDC service singleton."""
    return oidc_service


def configure_oidc_from_settings() -> OIDCService:
    """Configure OIDC service from application settings."""
    service = get_oidc_service()

    # Register Nextcloud if configured
    if hasattr(settings, "NEXTCLOUD_URL") and settings.NEXTCLOUD_URL:
        service.register_nextcloud(
            base_url=settings.NEXTCLOUD_URL,
            client_id=getattr(settings, "NEXTCLOUD_OAUTH_CLIENT_ID", ""),
            client_secret=getattr(settings, "NEXTCLOUD_OAUTH_CLIENT_SECRET", ""),
            redirect_uri=getattr(
                settings,
                "NEXTCLOUD_OAUTH_REDIRECT_URI",
                f"{settings.API_BASE_URL}/api/auth/oidc/callback",
            ),
        )

    # Register Google if configured
    if hasattr(settings, "GOOGLE_OAUTH_CLIENT_ID") and settings.GOOGLE_OAUTH_CLIENT_ID:
        service.register_google(
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", ""),
            redirect_uri=getattr(
                settings,
                "GOOGLE_OAUTH_REDIRECT_URI",
                f"{settings.API_BASE_URL}/api/auth/google/callback",
            ),
        )

    # Register Microsoft if configured
    if hasattr(settings, "MICROSOFT_TENANT_ID") and settings.MICROSOFT_TENANT_ID:
        service.register_microsoft(
            tenant_id=settings.MICROSOFT_TENANT_ID,
            client_id=getattr(settings, "MICROSOFT_CLIENT_ID", ""),
            client_secret=getattr(settings, "MICROSOFT_CLIENT_SECRET", ""),
            redirect_uri=getattr(
                settings,
                "MICROSOFT_REDIRECT_URI",
                f"{settings.API_BASE_URL}/api/auth/microsoft/callback",
            ),
        )

    return service
