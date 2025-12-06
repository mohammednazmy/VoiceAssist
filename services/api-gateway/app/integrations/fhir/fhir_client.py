"""
FHIR R4 Client Service

Generic FHIR R4 client with:
- Resource read, search, and bundle operations
- Retry logic with exponential backoff
- Response caching
- Rate limiting
- Metrics collection
- Audit logging integration

Designed to be extended by EHR-specific adapters (Epic, Cerner, etc.)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, TypeVar

import aiohttp

from .fhir_models import (
    FHIRAllergyIntolerance,
    FHIRCondition,
    FHIRMedication,
    FHIRObservation,
    FHIRPatient,
    FHIRProcedure,
    FHIRResourceType,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


# ==============================================================================
# Exceptions
# ==============================================================================


class FHIRError(Exception):
    """Base FHIR error"""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class FHIRAuthenticationError(FHIRError):
    """Authentication failed"""


class FHIRAuthorizationError(FHIRError):
    """Authorization denied"""


class FHIRNotFoundError(FHIRError):
    """Resource not found"""


class FHIRRateLimitError(FHIRError):
    """Rate limit exceeded"""


class FHIRServerError(FHIRError):
    """Server error"""


class FHIRTimeoutError(FHIRError):
    """Request timeout"""


class FHIRConflictError(FHIRError):
    """Resource conflict (version mismatch or duplicate)"""


class FHIRValidationError(FHIRError):
    """Resource validation failed"""

    def __init__(self, message: str, issues: Optional[List[Dict[str, Any]]] = None):
        super().__init__(message, 400)
        self.issues = issues or []


class FHIRPreconditionError(FHIRError):
    """Precondition failed (ETag mismatch)"""


# ==============================================================================
# Write Operation Models
# ==============================================================================


@dataclass
class FHIRWriteResult:
    """Result of a FHIR write operation"""

    success: bool
    resource_id: Optional[str] = None
    version_id: Optional[str] = None
    etag: Optional[str] = None
    location: Optional[str] = None
    operation: str = ""  # create, update, delete
    resource_type: str = ""
    issues: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "resource_id": self.resource_id,
            "version_id": self.version_id,
            "etag": self.etag,
            "location": self.location,
            "operation": self.operation,
            "resource_type": self.resource_type,
            "issues": self.issues,
            "error": self.error,
        }


# ==============================================================================
# Configuration
# ==============================================================================


@dataclass
class FHIRClientConfig:
    """Configuration for FHIR client"""

    base_url: str
    timeout_seconds: int = 30
    max_retries: int = 3
    retry_delay_seconds: float = 1.0
    retry_backoff_factor: float = 2.0

    # Rate limiting
    requests_per_second: float = 10.0
    burst_limit: int = 20

    # Caching
    cache_enabled: bool = True
    cache_ttl_seconds: int = 300  # 5 minutes

    # Pagination
    default_page_size: int = 50
    max_page_size: int = 200

    # Headers
    default_headers: Dict[str, str] = field(
        default_factory=lambda: {
            "Accept": "application/fhir+json",
            "Content-Type": "application/fhir+json",
        }
    )


@dataclass
class FHIRRequestMetrics:
    """Metrics for a FHIR request"""

    resource_type: str
    operation: str  # read, search, create, update, delete
    status_code: int
    latency_ms: float
    cache_hit: bool = False
    retry_count: int = 0
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class FHIRClientStats:
    """Aggregate statistics for FHIR client"""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    total_retries: int = 0
    avg_latency_ms: float = 0.0
    requests_by_resource: Dict[str, int] = field(default_factory=dict)
    errors_by_type: Dict[str, int] = field(default_factory=dict)


# ==============================================================================
# Cache
# ==============================================================================


@dataclass
class CacheEntry:
    """Cache entry with TTL"""

    data: Any
    expires_at: datetime


class FHIRCache:
    """Simple in-memory cache for FHIR responses"""

    def __init__(self, ttl_seconds: int = 300, max_entries: int = 1000):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._cache: Dict[str, CacheEntry] = {}
        self._access_order: List[str] = []

    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired"""
        entry = self._cache.get(key)
        if entry is None:
            return None

        if datetime.utcnow() > entry.expires_at:
            del self._cache[key]
            self._access_order.remove(key)
            return None

        return entry.data

    def set(self, key: str, value: Any) -> None:
        """Set cache value with TTL"""
        if len(self._cache) >= self.max_entries:
            # Evict oldest entry
            if self._access_order:
                oldest = self._access_order.pop(0)
                del self._cache[oldest]

        self._cache[key] = CacheEntry(
            data=value,
            expires_at=datetime.utcnow() + timedelta(seconds=self.ttl_seconds),
        )
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)

    def invalidate(self, key: str) -> None:
        """Remove specific cache entry"""
        if key in self._cache:
            del self._cache[key]
            self._access_order.remove(key)

    def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all entries matching pattern"""
        keys_to_remove = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_remove:
            self.invalidate(key)
        return len(keys_to_remove)

    def clear(self) -> None:
        """Clear all cache entries"""
        self._cache.clear()
        self._access_order.clear()


# ==============================================================================
# Rate Limiter
# ==============================================================================


class TokenBucketRateLimiter:
    """Token bucket rate limiter"""

    def __init__(self, rate: float, burst: int):
        self.rate = rate  # tokens per second
        self.burst = burst  # max tokens
        self.tokens = burst
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> float:
        """Acquire a token, return wait time if any"""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.tokens = min(self.burst, self.tokens + elapsed * self.rate)
            self.last_update = now

            if self.tokens >= 1:
                self.tokens -= 1
                return 0.0
            else:
                wait_time = (1 - self.tokens) / self.rate
                return wait_time


# ==============================================================================
# FHIR Client
# ==============================================================================


class FHIRClient:
    """
    Generic FHIR R4 client.

    Provides:
    - Resource read/search operations
    - Automatic retry with backoff
    - Response caching
    - Rate limiting
    - Metrics collection

    Usage:
        config = FHIRClientConfig(base_url="https://fhir.example.com/R4")
        client = FHIRClient(config)
        await client.initialize()

        patient = await client.read(FHIRResourceType.PATIENT, "123")
        meds = await client.search(FHIRResourceType.MEDICATION_REQUEST, {"patient": "123"})
    """

    # Resource type to model class mapping
    RESOURCE_MODELS = {
        FHIRResourceType.PATIENT: FHIRPatient,
        FHIRResourceType.MEDICATION_REQUEST: FHIRMedication,
        FHIRResourceType.CONDITION: FHIRCondition,
        FHIRResourceType.OBSERVATION: FHIRObservation,
        FHIRResourceType.PROCEDURE: FHIRProcedure,
        FHIRResourceType.ALLERGY_INTOLERANCE: FHIRAllergyIntolerance,
    }

    def __init__(
        self,
        config: FHIRClientConfig,
        event_bus=None,
        audit_service=None,
    ):
        self.config = config
        self.event_bus = event_bus
        self.audit_service = audit_service

        self._session: Optional[aiohttp.ClientSession] = None
        self._cache = FHIRCache(
            ttl_seconds=config.cache_ttl_seconds,
            max_entries=1000,
        )
        self._rate_limiter = TokenBucketRateLimiter(
            rate=config.requests_per_second,
            burst=config.burst_limit,
        )

        self._stats = FHIRClientStats()
        self._metrics: List[FHIRRequestMetrics] = []
        self._max_metrics = 1000

        self._initialized = False

    async def initialize(self) -> None:
        """Initialize HTTP session"""
        if self._initialized:
            return

        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds),
            headers=self.config.default_headers,
        )
        self._initialized = True
        logger.info(f"FHIRClient initialized for {self.config.base_url}")

    async def close(self) -> None:
        """Close HTTP session"""
        if self._session:
            await self._session.close()
            self._session = None
            self._initialized = False

    async def __aenter__(self):
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    # =========================================================================
    # Authentication (to be overridden by adapters)
    # =========================================================================

    async def get_access_token(self) -> Optional[str]:
        """
        Get access token for authenticated requests.
        Override in subclass for OAuth/SMART on FHIR.
        """
        return None

    async def refresh_access_token(self) -> Optional[str]:
        """
        Refresh access token.
        Override in subclass for OAuth/SMART on FHIR.
        """
        return None

    async def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers"""
        token = await self.get_access_token()
        if token:
            return {"Authorization": f"Bearer {token}"}
        return {}

    # =========================================================================
    # Core Operations
    # =========================================================================

    async def read(
        self,
        resource_type: FHIRResourceType,
        resource_id: str,
        use_cache: bool = True,
    ) -> Optional[Any]:
        """
        Read a single resource by ID.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID
            use_cache: Whether to use cache

        Returns:
            Parsed resource model or None if not found
        """
        cache_key = f"{resource_type.value}/{resource_id}"

        # Check cache
        if use_cache and self.config.cache_enabled:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._stats.cache_hits += 1
                return cached

        self._stats.cache_misses += 1

        # Make request
        url = f"{self.config.base_url}/{resource_type.value}/{resource_id}"
        response_data = await self._request("GET", url, resource_type.value, "read")

        if response_data is None:
            return None

        # Parse into model
        model_class = self.RESOURCE_MODELS.get(resource_type)
        if model_class:
            result = model_class.from_fhir(response_data)
        else:
            result = response_data

        # Cache result
        if self.config.cache_enabled:
            self._cache.set(cache_key, result)

        return result

    async def search(
        self,
        resource_type: FHIRResourceType,
        params: Dict[str, Any],
        max_results: Optional[int] = None,
        use_cache: bool = True,
    ) -> List[Any]:
        """
        Search for resources.

        Args:
            resource_type: FHIR resource type
            params: Search parameters
            max_results: Maximum results to return
            use_cache: Whether to use cache

        Returns:
            List of parsed resource models
        """
        # Build cache key
        param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        cache_key = f"search:{resource_type.value}?{param_str}"

        # Check cache
        if use_cache and self.config.cache_enabled:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._stats.cache_hits += 1
                return cached

        self._stats.cache_misses += 1

        # Make request
        url = f"{self.config.base_url}/{resource_type.value}"

        # Add pagination
        if "_count" not in params:
            params["_count"] = min(
                max_results or self.config.default_page_size,
                self.config.max_page_size,
            )

        response_data = await self._request("GET", url, resource_type.value, "search", params=params)

        if response_data is None:
            return []

        # Parse bundle
        results = []
        model_class = self.RESOURCE_MODELS.get(resource_type)

        entries = response_data.get("entry", [])
        for entry in entries:
            resource = entry.get("resource", {})
            if model_class:
                results.append(model_class.from_fhir(resource))
            else:
                results.append(resource)

            if max_results and len(results) >= max_results:
                break

        # Handle pagination if needed
        if max_results is None or len(results) < max_results:
            next_url = self._get_next_link(response_data)
            while next_url and (max_results is None or len(results) < max_results):
                page_data = await self._request("GET", next_url, resource_type.value, "search")
                if page_data is None:
                    break

                for entry in page_data.get("entry", []):
                    resource = entry.get("resource", {})
                    if model_class:
                        results.append(model_class.from_fhir(resource))
                    else:
                        results.append(resource)

                    if max_results and len(results) >= max_results:
                        break

                next_url = self._get_next_link(page_data)

        # Cache result
        if self.config.cache_enabled:
            self._cache.set(cache_key, results)

        return results

    def _get_next_link(self, bundle: Dict[str, Any]) -> Optional[str]:
        """Get next page URL from bundle"""
        links = bundle.get("link", [])
        for link in links:
            if link.get("relation") == "next":
                return link.get("url")
        return None

    # =========================================================================
    # Write Operations (Phase 6b)
    # =========================================================================

    async def create(
        self,
        resource_type: FHIRResourceType,
        resource: Dict[str, Any],
        if_none_exist: Optional[str] = None,
    ) -> FHIRWriteResult:
        """
        Create a new resource.

        Args:
            resource_type: FHIR resource type
            resource: Resource data (without id)
            if_none_exist: Conditional create criteria (e.g., "identifier=...")

        Returns:
            FHIRWriteResult with created resource ID and version
        """
        # Ensure resource type is set
        resource["resourceType"] = resource_type.value

        url = f"{self.config.base_url}/{resource_type.value}"

        # Build headers for conditional create
        extra_headers = {}
        if if_none_exist:
            extra_headers["If-None-Exist"] = if_none_exist

        response_data, response_headers = await self._write_request(
            "POST",
            url,
            resource_type.value,
            "create",
            data=resource,
            extra_headers=extra_headers,
        )

        # Invalidate cache for this resource type
        if self.config.cache_enabled:
            self._cache.invalidate_pattern(f"search:{resource_type.value}")

        # Extract result info
        result = FHIRWriteResult(
            success=True,
            operation="create",
            resource_type=resource_type.value,
        )

        if response_data:
            result.resource_id = response_data.get("id")

        if response_headers:
            result.location = response_headers.get("Location")
            result.etag = response_headers.get("ETag")
            # Extract version from ETag (format: W/"version")
            if result.etag:
                result.version_id = result.etag.strip('W/"').strip('"')

        return result

    async def update(
        self,
        resource_type: FHIRResourceType,
        resource_id: str,
        resource: Dict[str, Any],
        etag: Optional[str] = None,
        if_match: bool = True,
    ) -> FHIRWriteResult:
        """
        Update an existing resource.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID to update
            resource: Updated resource data
            etag: ETag for optimistic locking (required if if_match=True)
            if_match: Require ETag match for update (recommended for concurrency)

        Returns:
            FHIRWriteResult with updated version info

        Raises:
            FHIRPreconditionError: If ETag doesn't match (concurrent modification)
        """
        # Ensure resource metadata
        resource["resourceType"] = resource_type.value
        resource["id"] = resource_id

        url = f"{self.config.base_url}/{resource_type.value}/{resource_id}"

        # Build headers for conditional update
        extra_headers = {}
        if if_match and etag:
            extra_headers["If-Match"] = etag

        response_data, response_headers = await self._write_request(
            "PUT",
            url,
            resource_type.value,
            "update",
            data=resource,
            extra_headers=extra_headers,
        )

        # Invalidate cache for this resource
        if self.config.cache_enabled:
            cache_key = f"{resource_type.value}/{resource_id}"
            self._cache.invalidate(cache_key)
            self._cache.invalidate_pattern(f"search:{resource_type.value}")

        # Extract result info
        result = FHIRWriteResult(
            success=True,
            resource_id=resource_id,
            operation="update",
            resource_type=resource_type.value,
        )

        if response_headers:
            result.etag = response_headers.get("ETag")
            if result.etag:
                result.version_id = result.etag.strip('W/"').strip('"')

        return result

    async def delete(
        self,
        resource_type: FHIRResourceType,
        resource_id: str,
        etag: Optional[str] = None,
    ) -> FHIRWriteResult:
        """
        Delete a resource.

        Args:
            resource_type: FHIR resource type
            resource_id: Resource ID to delete
            etag: Optional ETag for conditional delete

        Returns:
            FHIRWriteResult indicating success
        """
        url = f"{self.config.base_url}/{resource_type.value}/{resource_id}"

        extra_headers = {}
        if etag:
            extra_headers["If-Match"] = etag

        await self._write_request(
            "DELETE",
            url,
            resource_type.value,
            "delete",
            extra_headers=extra_headers,
        )

        # Invalidate cache
        if self.config.cache_enabled:
            cache_key = f"{resource_type.value}/{resource_id}"
            self._cache.invalidate(cache_key)
            self._cache.invalidate_pattern(f"search:{resource_type.value}")

        return FHIRWriteResult(
            success=True,
            resource_id=resource_id,
            operation="delete",
            resource_type=resource_type.value,
        )

    async def conditional_update(
        self,
        resource_type: FHIRResourceType,
        resource: Dict[str, Any],
        search_params: Dict[str, str],
    ) -> FHIRWriteResult:
        """
        Conditional update - update or create based on search criteria.

        Args:
            resource_type: FHIR resource type
            resource: Resource data
            search_params: Search criteria for matching existing resource

        Returns:
            FHIRWriteResult with operation outcome
        """
        resource["resourceType"] = resource_type.value

        # Build URL with search params
        param_str = "&".join(f"{k}={v}" for k, v in search_params.items())
        url = f"{self.config.base_url}/{resource_type.value}?{param_str}"

        response_data, response_headers = await self._write_request(
            "PUT",
            url,
            resource_type.value,
            "conditional_update",
            data=resource,
        )

        # Invalidate search cache
        if self.config.cache_enabled:
            self._cache.invalidate_pattern(f"search:{resource_type.value}")

        result = FHIRWriteResult(
            success=True,
            operation="conditional_update",
            resource_type=resource_type.value,
        )

        if response_data:
            result.resource_id = response_data.get("id")

        if response_headers:
            result.location = response_headers.get("Location")
            result.etag = response_headers.get("ETag")
            if result.etag:
                result.version_id = result.etag.strip('W/"').strip('"')

        return result

    async def get_resource_version(
        self,
        resource_type: FHIRResourceType,
        resource_id: str,
    ) -> Optional[str]:
        """
        Get the current version (ETag) of a resource.

        Useful before performing updates to get the latest ETag.
        """
        resource = await self.read(resource_type, resource_id, use_cache=False)
        if resource is None:
            return None

        # Make a HEAD request to get ETag efficiently
        url = f"{self.config.base_url}/{resource_type.value}/{resource_id}"

        try:
            auth_headers = await self._get_auth_headers()
            async with self._session.head(url, headers=auth_headers) as response:
                if response.status == 200:
                    return response.headers.get("ETag")
        except Exception as e:
            logger.warning(f"Failed to get resource version: {e}")

        return None

    async def _write_request(
        self,
        method: str,
        url: str,
        resource_type: str,
        operation: str,
        data: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, str]]]:
        """
        Make a write HTTP request with proper error handling.

        Returns:
            Tuple of (response_data, response_headers)
        """
        if not self._session:
            await self.initialize()

        # Rate limiting
        wait_time = await self._rate_limiter.acquire()
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        # Get auth headers
        auth_headers = await self._get_auth_headers()
        if extra_headers:
            auth_headers.update(extra_headers)

        start_time = time.monotonic()
        retry_count = 0

        for attempt in range(self.config.max_retries + 1):
            try:
                async with self._session.request(
                    method,
                    url,
                    json=data if data else None,
                    headers=auth_headers,
                ) as response:
                    latency_ms = (time.monotonic() - start_time) * 1000

                    # Record metrics
                    self._record_metrics(
                        resource_type=resource_type,
                        operation=operation,
                        status_code=response.status,
                        latency_ms=latency_ms,
                        retry_count=retry_count,
                    )

                    # Get response headers
                    resp_headers = dict(response.headers)

                    # Success responses
                    if response.status in (200, 201):
                        self._stats.successful_requests += 1
                        response_data = await response.json()
                        return response_data, resp_headers

                    elif response.status == 204:
                        # No content (successful delete)
                        self._stats.successful_requests += 1
                        return None, resp_headers

                    # Error responses
                    elif response.status == 400:
                        # Validation error
                        text = await response.text()
                        try:
                            error_data = await response.json()
                            issues = error_data.get("issue", [])
                        except Exception:
                            issues = [{"diagnostics": text}]
                        raise FHIRValidationError(
                            f"Validation failed: {text[:200]}",
                            issues=issues,
                        )

                    elif response.status == 401:
                        # Try token refresh
                        new_token = await self.refresh_access_token()
                        if new_token:
                            auth_headers["Authorization"] = f"Bearer {new_token}"
                            continue
                        raise FHIRAuthenticationError("Authentication failed", response.status)

                    elif response.status == 403:
                        raise FHIRAuthorizationError("Authorization denied", response.status)

                    elif response.status == 404:
                        raise FHIRNotFoundError("Resource not found", response.status)

                    elif response.status == 409:
                        # Conflict (duplicate or version conflict)
                        text = await response.text()
                        raise FHIRConflictError(f"Conflict: {text[:200]}", response.status)

                    elif response.status == 412:
                        # Precondition failed (ETag mismatch)
                        raise FHIRPreconditionError(
                            "Precondition failed - resource was modified",
                            response.status,
                        )

                    elif response.status == 429:
                        # Rate limited
                        retry_after = int(response.headers.get("Retry-After", 5))
                        await asyncio.sleep(retry_after)
                        retry_count += 1
                        continue

                    elif response.status >= 500:
                        # Server error - retry
                        retry_count += 1
                        if attempt < self.config.max_retries:
                            await asyncio.sleep(
                                self.config.retry_delay_seconds * (self.config.retry_backoff_factor**attempt)
                            )
                            continue
                        raise FHIRServerError(f"Server error: {response.status}", response.status)

                    else:
                        text = await response.text()
                        raise FHIRError(
                            f"Unexpected response {response.status}: {text[:200]}",
                            response.status,
                        )

            except asyncio.TimeoutError:
                retry_count += 1
                if attempt < self.config.max_retries:
                    await asyncio.sleep(self.config.retry_delay_seconds * (self.config.retry_backoff_factor**attempt))
                    continue
                raise FHIRTimeoutError("Request timeout")

            except aiohttp.ClientError as e:
                retry_count += 1
                if attempt < self.config.max_retries:
                    await asyncio.sleep(self.config.retry_delay_seconds * (self.config.retry_backoff_factor**attempt))
                    continue
                raise FHIRError(f"Network error: {str(e)}")

        self._stats.failed_requests += 1
        raise FHIRError("Max retries exceeded")

    # =========================================================================
    # HTTP Layer
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
        """
        Make HTTP request with retry and rate limiting.
        """
        if not self._session:
            await self.initialize()

        # Rate limiting
        wait_time = await self._rate_limiter.acquire()
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        # Get auth headers
        auth_headers = await self._get_auth_headers()

        start_time = time.monotonic()
        retry_count = 0
        last_error: Optional[Exception] = None

        for attempt in range(self.config.max_retries + 1):
            try:
                async with self._session.request(
                    method,
                    url,
                    params=params,
                    json=data,
                    headers=auth_headers,
                ) as response:
                    latency_ms = (time.monotonic() - start_time) * 1000

                    # Record metrics
                    self._record_metrics(
                        resource_type=resource_type,
                        operation=operation,
                        status_code=response.status,
                        latency_ms=latency_ms,
                        retry_count=retry_count,
                    )

                    # Handle response
                    if response.status == 200:
                        self._stats.successful_requests += 1
                        return await response.json()

                    elif response.status == 401:
                        # Try token refresh
                        new_token = await self.refresh_access_token()
                        if new_token:
                            auth_headers = {"Authorization": f"Bearer {new_token}"}
                            continue
                        raise FHIRAuthenticationError("Authentication failed", response.status)

                    elif response.status == 403:
                        raise FHIRAuthorizationError("Authorization denied", response.status)

                    elif response.status == 404:
                        return None

                    elif response.status == 429:
                        # Rate limited - wait and retry
                        retry_after = int(response.headers.get("Retry-After", 5))
                        await asyncio.sleep(retry_after)
                        retry_count += 1
                        continue

                    elif response.status >= 500:
                        # Server error - retry
                        last_error = FHIRServerError(f"Server error: {response.status}", response.status)
                        retry_count += 1
                        await asyncio.sleep(
                            self.config.retry_delay_seconds * (self.config.retry_backoff_factor**attempt)
                        )
                        continue

                    else:
                        # Other error
                        text = await response.text()
                        raise FHIRError(
                            f"Unexpected response {response.status}: {text[:200]}",
                            response.status,
                        )

            except asyncio.TimeoutError:
                last_error = FHIRTimeoutError("Request timeout")
                retry_count += 1
                if attempt < self.config.max_retries:
                    await asyncio.sleep(self.config.retry_delay_seconds * (self.config.retry_backoff_factor**attempt))
                    continue

            except aiohttp.ClientError as e:
                last_error = FHIRError(f"Network error: {str(e)}")
                retry_count += 1
                if attempt < self.config.max_retries:
                    await asyncio.sleep(self.config.retry_delay_seconds * (self.config.retry_backoff_factor**attempt))
                    continue

        # All retries exhausted
        self._stats.failed_requests += 1
        self._stats.total_retries += retry_count

        if last_error:
            error_type = type(last_error).__name__
            self._stats.errors_by_type[error_type] = self._stats.errors_by_type.get(error_type, 0) + 1
            raise last_error

        return None

    def _record_metrics(
        self,
        resource_type: str,
        operation: str,
        status_code: int,
        latency_ms: float,
        retry_count: int = 0,
        cache_hit: bool = False,
    ) -> None:
        """Record request metrics"""
        self._stats.total_requests += 1
        self._stats.requests_by_resource[resource_type] = self._stats.requests_by_resource.get(resource_type, 0) + 1

        # Update average latency
        n = self._stats.total_requests
        self._stats.avg_latency_ms = (self._stats.avg_latency_ms * (n - 1) + latency_ms) / n

        # Store metric
        metric = FHIRRequestMetrics(
            resource_type=resource_type,
            operation=operation,
            status_code=status_code,
            latency_ms=latency_ms,
            cache_hit=cache_hit,
            retry_count=retry_count,
        )
        self._metrics.append(metric)
        if len(self._metrics) > self._max_metrics:
            self._metrics.pop(0)

    # =========================================================================
    # Convenience Methods
    # =========================================================================

    async def get_patient(self, patient_id: str) -> Optional[FHIRPatient]:
        """Get patient by ID"""
        return await self.read(FHIRResourceType.PATIENT, patient_id)

    async def get_patient_medications(
        self,
        patient_id: str,
        active_only: bool = True,
    ) -> List[FHIRMedication]:
        """Get patient's medications"""
        params = {"patient": patient_id}
        if active_only:
            params["status"] = "active"
        return await self.search(FHIRResourceType.MEDICATION_REQUEST, params)

    async def get_patient_conditions(
        self,
        patient_id: str,
        active_only: bool = True,
    ) -> List[FHIRCondition]:
        """Get patient's conditions/problems"""
        params = {"patient": patient_id}
        if active_only:
            params["clinical-status"] = "active"
        return await self.search(FHIRResourceType.CONDITION, params)

    async def get_patient_observations(
        self,
        patient_id: str,
        category: Optional[str] = None,
        code: Optional[str] = None,
        days_back: int = 30,
    ) -> List[FHIRObservation]:
        """Get patient's observations (labs, vitals)"""
        params = {"patient": patient_id}
        if category:
            params["category"] = category
        if code:
            params["code"] = code

        # Date filter
        date_from = datetime.utcnow() - timedelta(days=days_back)
        params["date"] = f"ge{date_from.strftime('%Y-%m-%d')}"

        return await self.search(FHIRResourceType.OBSERVATION, params)

    async def get_patient_vitals(
        self,
        patient_id: str,
        days_back: int = 7,
    ) -> List[FHIRObservation]:
        """Get patient's vital signs"""
        return await self.get_patient_observations(
            patient_id,
            category="vital-signs",
            days_back=days_back,
        )

    async def get_patient_labs(
        self,
        patient_id: str,
        code: Optional[str] = None,
        days_back: int = 30,
    ) -> List[FHIRObservation]:
        """Get patient's lab results"""
        return await self.get_patient_observations(
            patient_id,
            category="laboratory",
            code=code,
            days_back=days_back,
        )

    async def get_patient_allergies(
        self,
        patient_id: str,
    ) -> List[FHIRAllergyIntolerance]:
        """Get patient's allergies"""
        params = {"patient": patient_id}
        return await self.search(FHIRResourceType.ALLERGY_INTOLERANCE, params)

    async def get_patient_procedures(
        self,
        patient_id: str,
        days_back: int = 365,
    ) -> List[FHIRProcedure]:
        """Get patient's procedures"""
        params = {"patient": patient_id}
        date_from = datetime.utcnow() - timedelta(days=days_back)
        params["date"] = f"ge{date_from.strftime('%Y-%m-%d')}"
        return await self.search(FHIRResourceType.PROCEDURE, params)

    # =========================================================================
    # Cache Management
    # =========================================================================

    def invalidate_patient_cache(self, patient_id: str) -> int:
        """Invalidate all cached data for a patient"""
        return self._cache.invalidate_pattern(patient_id)

    def clear_cache(self) -> None:
        """Clear all cached data"""
        self._cache.clear()

    # =========================================================================
    # Statistics
    # =========================================================================

    def get_stats(self) -> Dict[str, Any]:
        """Get client statistics"""
        return {
            "total_requests": self._stats.total_requests,
            "successful_requests": self._stats.successful_requests,
            "failed_requests": self._stats.failed_requests,
            "cache_hits": self._stats.cache_hits,
            "cache_misses": self._stats.cache_misses,
            "cache_hit_rate": (self._stats.cache_hits / max(1, self._stats.cache_hits + self._stats.cache_misses)),
            "total_retries": self._stats.total_retries,
            "avg_latency_ms": self._stats.avg_latency_ms,
            "requests_by_resource": self._stats.requests_by_resource,
            "errors_by_type": self._stats.errors_by_type,
        }

    def get_recent_metrics(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent request metrics"""
        metrics = self._metrics[-limit:]
        return [
            {
                "resource_type": m.resource_type,
                "operation": m.operation,
                "status_code": m.status_code,
                "latency_ms": m.latency_ms,
                "cache_hit": m.cache_hit,
                "retry_count": m.retry_count,
                "timestamp": m.timestamp.isoformat(),
            }
            for m in metrics
        ]


__all__ = [
    "FHIRClient",
    "FHIRClientConfig",
    "FHIRClientStats",
    "FHIRRequestMetrics",
    "FHIRWriteResult",
    "FHIRError",
    "FHIRAuthenticationError",
    "FHIRAuthorizationError",
    "FHIRNotFoundError",
    "FHIRRateLimitError",
    "FHIRServerError",
    "FHIRTimeoutError",
    "FHIRConflictError",
    "FHIRValidationError",
    "FHIRPreconditionError",
    "FHIRCache",
]
