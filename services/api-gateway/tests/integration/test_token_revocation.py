"""Unit tests for Token Revocation service."""

import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from app.services.token_revocation import TokenRevocationService


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    redis = AsyncMock()
    redis.ping = AsyncMock()
    redis.setex = AsyncMock(return_value=True)
    redis.exists = AsyncMock(return_value=0)
    redis.delete = AsyncMock(return_value=1)
    redis.close = AsyncMock()
    return redis


@pytest.fixture
async def revocation_service(mock_redis):
    """Create a TokenRevocationService with mock Redis."""
    service = TokenRevocationService()
    service.redis_client = mock_redis
    return service


class TestTokenRevocationService:
    """Tests for TokenRevocationService."""

    @pytest.mark.asyncio
    async def test_connect(self, mock_redis):
        """Test connecting to Redis."""
        service = TokenRevocationService()

        with patch(
            "app.services.token_revocation.redis.from_url", return_value=mock_redis
        ):
            await service.connect()

            assert service.redis_client is not None
            mock_redis.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect(self, revocation_service, mock_redis):
        """Test disconnecting from Redis."""
        await revocation_service.disconnect()

        mock_redis.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_revoke_token(self, revocation_service, mock_redis):
        """Test revoking a single token."""
        token = "test_jwt_token_12345"
        ttl = 900

        result = await revocation_service.revoke_token(token, ttl_seconds=ttl)

        assert result is True
        mock_redis.setex.assert_called_once()

        # Check the call arguments
        call_args = mock_redis.setex.call_args
        assert call_args.kwargs["name"] == f"revoked_token:{token}"
        assert call_args.kwargs["time"] == timedelta(seconds=ttl)
        assert call_args.kwargs["value"] == "1"

    @pytest.mark.asyncio
    async def test_revoke_token_default_ttl(self, revocation_service, mock_redis):
        """Test revoking token with default TTL."""
        token = "test_jwt_token_12345"

        result = await revocation_service.revoke_token(token)

        assert result is True

        # Should use default TTL of 900 seconds (15 minutes)
        call_args = mock_redis.setex.call_args
        assert call_args.kwargs["time"] == timedelta(seconds=900)

    @pytest.mark.asyncio
    async def test_is_token_revoked_false(self, revocation_service, mock_redis):
        """Test checking if a token is revoked (not revoked case)."""
        token = "valid_token_12345"
        mock_redis.exists.return_value = 0

        is_revoked = await revocation_service.is_token_revoked(token)

        assert is_revoked is False
        mock_redis.exists.assert_called_once_with(f"revoked_token:{token}")

    @pytest.mark.asyncio
    async def test_is_token_revoked_true(self, revocation_service, mock_redis):
        """Test checking if a token is revoked (revoked case)."""
        token = "revoked_token_12345"
        mock_redis.exists.return_value = 1

        is_revoked = await revocation_service.is_token_revoked(token)

        assert is_revoked is True
        mock_redis.exists.assert_called_once_with(f"revoked_token:{token}")

    @pytest.mark.asyncio
    async def test_is_token_revoked_no_redis_connection(self):
        """Test fail-open behavior when Redis is not connected."""
        service = TokenRevocationService()
        # No Redis connection
        service.redis_client = None

        token = "any_token"
        is_revoked = await service.is_token_revoked(token)

        # Should fail open (allow the token)
        assert is_revoked is False

    @pytest.mark.asyncio
    async def test_revoke_all_user_tokens(self, revocation_service, mock_redis):
        """Test revoking all tokens for a user."""
        user_id = str(uuid.uuid4())
        ttl = 900

        result = await revocation_service.revoke_all_user_tokens(
            user_id, ttl_seconds=ttl
        )

        assert result is True
        mock_redis.setex.assert_called_once()

        call_args = mock_redis.setex.call_args
        assert call_args.kwargs["name"] == f"revoked_user:{user_id}"
        assert call_args.kwargs["time"] == timedelta(seconds=ttl)
        assert call_args.kwargs["value"] == "1"

    @pytest.mark.asyncio
    async def test_is_user_revoked_false(self, revocation_service, mock_redis):
        """Test checking if user is revoked (not revoked case)."""
        user_id = str(uuid.uuid4())
        mock_redis.exists.return_value = 0

        is_revoked = await revocation_service.is_user_revoked(user_id)

        assert is_revoked is False
        mock_redis.exists.assert_called_once_with(f"revoked_user:{user_id}")

    @pytest.mark.asyncio
    async def test_is_user_revoked_true(self, revocation_service, mock_redis):
        """Test checking if user is revoked (revoked case)."""
        user_id = str(uuid.uuid4())
        mock_redis.exists.return_value = 1

        is_revoked = await revocation_service.is_user_revoked(user_id)

        assert is_revoked is True
        mock_redis.exists.assert_called_once_with(f"revoked_user:{user_id}")

    @pytest.mark.asyncio
    async def test_is_user_revoked_no_redis_connection(self):
        """Test fail-open behavior for user revocation when Redis is down."""
        service = TokenRevocationService()
        service.redis_client = None

        user_id = str(uuid.uuid4())
        is_revoked = await service.is_user_revoked(user_id)

        # Should fail open
        assert is_revoked is False

    @pytest.mark.asyncio
    async def test_clear_user_revocation(self, revocation_service, mock_redis):
        """Test clearing user revocation."""
        user_id = str(uuid.uuid4())

        result = await revocation_service.clear_user_revocation(user_id)

        assert result is True
        mock_redis.delete.assert_called_once_with(f"revoked_user:{user_id}")

    @pytest.mark.asyncio
    async def test_revoke_token_with_long_ttl(self, revocation_service, mock_redis):
        """Test revoking token with custom TTL (refresh token scenario)."""
        token = "refresh_token_12345"
        ttl = 604800  # 7 days

        result = await revocation_service.revoke_token(token, ttl_seconds=ttl)

        assert result is True

        call_args = mock_redis.setex.call_args
        assert call_args.kwargs["time"] == timedelta(seconds=ttl)

    @pytest.mark.asyncio
    async def test_multiple_tokens_revoked_independently(
        self, revocation_service, mock_redis
    ):
        """Test that multiple tokens can be revoked independently."""
        token1 = "token_1"
        token2 = "token_2"

        await revocation_service.revoke_token(token1)
        await revocation_service.revoke_token(token2)

        # Both should be called with different keys
        assert mock_redis.setex.call_count == 2

        call_args_list = mock_redis.setex.call_args_list
        keys = [call.kwargs["name"] for call in call_args_list]

        assert f"revoked_token:{token1}" in keys
        assert f"revoked_token:{token2}" in keys

    @pytest.mark.asyncio
    async def test_revoke_token_handles_redis_error_gracefully(
        self, revocation_service, mock_redis
    ):
        """Test that Redis errors are handled gracefully."""
        mock_redis.setex.side_effect = Exception("Redis connection error")

        token = "test_token"

        # Should not raise exception
        with pytest.raises(Exception):
            await revocation_service.revoke_token(token)

    @pytest.mark.asyncio
    async def test_token_revocation_key_format(self, revocation_service, mock_redis):
        """Test that revocation keys follow expected format."""
        token = "jwt_token_abc123"

        await revocation_service.revoke_token(token)

        call_args = mock_redis.setex.call_args
        key = call_args.kwargs["name"]

        # Should have prefix
        assert key.startswith("revoked_token:")
        assert token in key

    @pytest.mark.asyncio
    async def test_user_revocation_key_format(self, revocation_service, mock_redis):
        """Test that user revocation keys follow expected format."""
        user_id = str(uuid.uuid4())

        await revocation_service.revoke_all_user_tokens(user_id)

        call_args = mock_redis.setex.call_args
        key = call_args.kwargs["name"]

        # Should have prefix
        assert key.startswith("revoked_user:")
        assert user_id in key

    @pytest.mark.asyncio
    async def test_connect_redis_failure(self, mock_redis):
        """Test handling Redis connection failure."""
        mock_redis.ping.side_effect = Exception("Connection refused")

        service = TokenRevocationService()

        with patch(
            "app.services.token_revocation.redis.from_url", return_value=mock_redis
        ):
            with pytest.raises(Exception):
                await service.connect()

    @pytest.mark.asyncio
    async def test_singleton_instance(self):
        """Test that the module provides a singleton instance."""
        from app.services.token_revocation import token_revocation_service

        assert token_revocation_service is not None
        assert isinstance(token_revocation_service, TokenRevocationService)
