"""Cache Decorators for Query Result Caching.

Provides decorators to automatically cache expensive function results with
automatic cache key generation, TTL management, and cache invalidation.

Features:
- @cache_result decorator for synchronous and async functions
- Automatic cache key generation from function arguments
- Configurable TTL per decorator
- Cache invalidation helpers
- Support for excluding certain arguments from cache key
- Namespace support for organized invalidation

Usage:
    from app.core.cache_decorators import cache_result, invalidate_cache

    @cache_result(ttl=300, namespace="user")
    async def get_user_by_id(user_id: str) -> User:
        # Expensive database query
        return db.query(User).filter(User.id == user_id).first()

    @cache_result(ttl=3600, namespace="rag", exclude_args=["debug"])
    async def search_documents(query: str, top_k: int = 5, debug: bool = False):
        # Expensive RAG search
        return rag_service.search(query, top_k)

    # Invalidate cache for specific key
    await invalidate_cache("get_user_by_id", user_id="123", namespace="user")

    # Invalidate entire namespace
    await invalidate_namespace("user")
"""
from __future__ import annotations

import functools
import hashlib
import inspect
import json
from typing import Any, Callable, Optional, Set, TypeVar, Union

from app.services.cache_service import cache_service
from app.core.logging import get_logger


logger = get_logger(__name__)

T = TypeVar('T')


def _generate_cache_key(
    func: Callable,
    namespace: Optional[str],
    args: tuple,
    kwargs: dict,
    exclude_args: Set[str]
) -> str:
    """Generate a cache key from function name and arguments.

    Args:
        func: Function to cache
        namespace: Optional namespace prefix
        args: Positional arguments
        kwargs: Keyword arguments
        exclude_args: Set of argument names to exclude from key

    Returns:
        Cache key string
    """
    # Get function signature
    sig = inspect.signature(func)
    bound_args = sig.bind(*args, **kwargs)
    bound_args.apply_defaults()

    # Build key parts
    key_parts = []

    for param_name, param_value in bound_args.arguments.items():
        # Skip excluded arguments
        if param_name in exclude_args:
            continue

        # Skip 'self' and 'cls' for methods
        if param_name in ('self', 'cls'):
            continue

        # Convert value to string for hashing
        try:
            if hasattr(param_value, '__dict__'):
                # For objects, use their dict representation
                value_str = json.dumps(param_value.__dict__, sort_keys=True, default=str)
            else:
                value_str = json.dumps(param_value, sort_keys=True, default=str)
        except (TypeError, ValueError):
            # Fallback to str representation
            value_str = str(param_value)

        key_parts.append(f"{param_name}={value_str}")

    # Create hash from key parts
    key_data = "|".join(key_parts)
    key_hash = hashlib.md5(key_data.encode()).hexdigest()[:16]

    # Build full key
    func_name = f"{func.__module__}.{func.__qualname__}"
    if namespace:
        return f"{namespace}:{func_name}:{key_hash}"
    else:
        return f"{func_name}:{key_hash}"


def cache_result(
    ttl: Optional[int] = None,
    namespace: Optional[str] = None,
    exclude_args: Optional[Set[str]] = None,
    key_builder: Optional[Callable] = None
) -> Callable[[T], T]:
    """Decorator to cache function results.

    Args:
        ttl: Time-to-live in seconds (None = use default from cache service)
        namespace: Namespace for cache keys (useful for bulk invalidation)
        exclude_args: Set of argument names to exclude from cache key
        key_builder: Custom function to build cache key (overrides default)

    Returns:
        Decorated function with caching

    Example:
        @cache_result(ttl=300, namespace="user")
        async def get_user(user_id: str) -> User:
            return await db.query(User).filter(User.id == user_id).first()

        @cache_result(ttl=3600, exclude_args={"debug", "verbose"})
        def expensive_calculation(data: dict, debug: bool = False):
            # debug flag won't affect cache key
            return compute(data)
    """
    exclude = exclude_args or set()

    def decorator(func: Callable) -> Callable:
        is_async = inspect.iscoroutinefunction(func)

        if is_async:
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                # Generate cache key
                if key_builder:
                    cache_key = key_builder(func, args, kwargs)
                else:
                    cache_key = _generate_cache_key(func, namespace, args, kwargs, exclude)

                # Try to get from cache
                cached_value = await cache_service.get(cache_key)
                if cached_value is not None:
                    logger.debug(
                        f"Cache hit for {func.__name__}",
                        extra={'cache_key': cache_key, 'namespace': namespace}
                    )
                    return cached_value

                # Cache miss - execute function
                logger.debug(
                    f"Cache miss for {func.__name__}",
                    extra={'cache_key': cache_key, 'namespace': namespace}
                )
                result = await func(*args, **kwargs)

                # Store in cache
                if result is not None:  # Don't cache None values
                    await cache_service.set(cache_key, result, ttl=ttl)

                return result

            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                # Generate cache key
                if key_builder:
                    cache_key = key_builder(func, args, kwargs)
                else:
                    cache_key = _generate_cache_key(func, namespace, args, kwargs, exclude)

                # Try to get from cache (Note: This blocks for async cache)
                # In production, consider using asyncio.run() or ensure cache_service
                # has sync methods
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    cached_value = loop.run_until_complete(cache_service.get(cache_key))
                except RuntimeError:
                    # No event loop running, create one
                    cached_value = asyncio.run(cache_service.get(cache_key))

                if cached_value is not None:
                    logger.debug(
                        f"Cache hit for {func.__name__}",
                        extra={'cache_key': cache_key, 'namespace': namespace}
                    )
                    return cached_value

                # Cache miss - execute function
                logger.debug(
                    f"Cache miss for {func.__name__}",
                    extra={'cache_key': cache_key, 'namespace': namespace}
                )
                result = func(*args, **kwargs)

                # Store in cache
                if result is not None:
                    try:
                        loop = asyncio.get_event_loop()
                        loop.run_until_complete(cache_service.set(cache_key, result, ttl=ttl))
                    except RuntimeError:
                        asyncio.run(cache_service.set(cache_key, result, ttl=ttl))

                return result

            return sync_wrapper

        return async_wrapper if is_async else sync_wrapper

    return decorator


async def invalidate_cache(
    func: Union[Callable, str],
    namespace: Optional[str] = None,
    *args,
    **kwargs
) -> bool:
    """Invalidate cache for a specific function call.

    Args:
        func: Function or function name to invalidate
        namespace: Namespace used in @cache_result decorator
        *args: Positional arguments used in original call
        **kwargs: Keyword arguments used in original call

    Returns:
        True if cache was invalidated, False otherwise

    Example:
        # Invalidate specific cache entry
        await invalidate_cache(get_user, namespace="user", user_id="123")

        # Or with function name
        await invalidate_cache("get_user", namespace="user", user_id="123")
    """
    try:
        if isinstance(func, str):
            # Build key from string
            func_name = func
            key_parts = [f"{k}={v}" for k, v in sorted(kwargs.items())]
            key_data = "|".join(key_parts)
            key_hash = hashlib.md5(key_data.encode()).hexdigest()[:16]

            if namespace:
                cache_key = f"{namespace}:{func_name}:{key_hash}"
            else:
                cache_key = f"{func_name}:{key_hash}"
        else:
            # Generate key from function
            cache_key = _generate_cache_key(func, namespace, args, kwargs, set())

        return await cache_service.delete(cache_key)

    except Exception as e:
        logger.error(f"Error invalidating cache: {e}", exc_info=True)
        return False


async def invalidate_namespace(namespace: str) -> int:
    """Invalidate all cache entries in a namespace.

    Args:
        namespace: Namespace to invalidate

    Returns:
        Number of keys invalidated

    Example:
        # Invalidate all user-related caches
        await invalidate_namespace("user")

        # Invalidate all RAG caches
        await invalidate_namespace("rag")
    """
    try:
        pattern = f"{namespace}:*"
        return await cache_service.delete_pattern(pattern)
    except Exception as e:
        logger.error(f"Error invalidating namespace '{namespace}': {e}", exc_info=True)
        return 0


def cache_on_mutation(
    mutation_func: Callable,
    invalidate_funcs: list[tuple[Callable, dict]],
    namespace: Optional[str] = None
):
    """Decorator to invalidate caches when a mutation occurs.

    This decorator wraps a mutation function (e.g., update_user, delete_document)
    and invalidates related cached queries when the mutation succeeds.

    Args:
        mutation_func: Function that performs the mutation
        invalidate_funcs: List of (function, kwargs) tuples to invalidate
        namespace: Optional namespace for invalidation

    Example:
        @cache_on_mutation(
            mutation_func=update_user,
            invalidate_funcs=[
                (get_user, {"user_id": "user_id"}),
                (list_users, {})
            ],
            namespace="user"
        )
        async def update_user(user_id: str, data: dict):
            # Perform update
            user = await db.update(user_id, data)
            return user
    """
    def decorator(func: Callable) -> Callable:
        is_async = inspect.iscoroutinefunction(func)

        if is_async:
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                # Execute the mutation
                result = await func(*args, **kwargs)

                # Invalidate related caches
                for invalidate_func, invalidate_kwargs in invalidate_funcs:
                    # Resolve kwargs from function args
                    resolved_kwargs = {}
                    for key, value in invalidate_kwargs.items():
                        if value in kwargs:
                            resolved_kwargs[key] = kwargs[value]
                        else:
                            # Try to get from args by name
                            sig = inspect.signature(func)
                            param_names = list(sig.parameters.keys())
                            if value in param_names:
                                idx = param_names.index(value)
                                if idx < len(args):
                                    resolved_kwargs[key] = args[idx]

                    await invalidate_cache(
                        invalidate_func,
                        namespace=namespace,
                        **resolved_kwargs
                    )

                return result

            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                # Execute the mutation
                result = func(*args, **kwargs)

                # Invalidate related caches
                import asyncio
                for invalidate_func, invalidate_kwargs in invalidate_funcs:
                    resolved_kwargs = {}
                    for key, value in invalidate_kwargs.items():
                        if value in kwargs:
                            resolved_kwargs[key] = kwargs[value]

                    try:
                        loop = asyncio.get_event_loop()
                        loop.run_until_complete(
                            invalidate_cache(invalidate_func, namespace=namespace, **resolved_kwargs)
                        )
                    except RuntimeError:
                        asyncio.run(
                            invalidate_cache(invalidate_func, namespace=namespace, **resolved_kwargs)
                        )

                return result

            return sync_wrapper

    return decorator


class CacheManager:
    """Context manager for cache warming and batch operations."""

    def __init__(self, namespace: str):
        """Initialize cache manager.

        Args:
            namespace: Namespace for cache operations
        """
        self.namespace = namespace
        self.operations: list[tuple[str, str, Any, int]] = []

    def add(self, func: Callable, args: tuple, kwargs: dict, ttl: Optional[int] = None):
        """Add an operation to warm the cache.

        Args:
            func: Function to cache
            args: Function arguments
            kwargs: Function keyword arguments
            ttl: Time-to-live for cached value
        """
        cache_key = _generate_cache_key(func, self.namespace, args, kwargs, set())
        self.operations.append(('warm', cache_key, (func, args, kwargs), ttl))

    async def execute(self):
        """Execute all queued cache operations."""
        for op_type, cache_key, data, ttl in self.operations:
            if op_type == 'warm':
                func, args, kwargs = data
                if inspect.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)

                await cache_service.set(cache_key, result, ttl=ttl)

        logger.info(
            f"Cache warmed: {len(self.operations)} operations in namespace '{self.namespace}'"
        )

    async def __aenter__(self):
        """Enter context manager."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager and execute operations."""
        if exc_type is None:
            await self.execute()
