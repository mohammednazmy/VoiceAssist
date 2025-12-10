"""
Nextcloud integration service for user provisioning and file management
"""

from typing import Any, Dict, Optional

import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger(__name__)


class NextcloudService:
    """Service for interacting with Nextcloud API"""

    def __init__(self):
        self.base_url = settings.NEXTCLOUD_URL.rstrip("/")
        self.admin_user = settings.NEXTCLOUD_ADMIN_USER
        self.admin_password = settings.NEXTCLOUD_ADMIN_PASSWORD
        self.timeout = 30.0

    async def health_check(self) -> bool:
        """
        Check if Nextcloud is accessible

        Returns:
            True if Nextcloud is accessible, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/status.php",
                    auth=(self.admin_user, self.admin_password),
                )
                return response.status_code == 200
        except Exception as e:
            logger.warning("nextcloud_health_check_failed", error=str(e))
            return False

    async def create_user(self, username: str, password: str, email: str, display_name: str) -> bool:
        """
        Create a new user in Nextcloud

        Args:
            username: Nextcloud username (usually email prefix)
            password: User's password
            email: User's email address
            display_name: User's display name

        Returns:
            True if user was created successfully, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Create user
                response = await client.post(
                    f"{self.base_url}/ocs/v1.php/cloud/users",
                    auth=(self.admin_user, self.admin_password),
                    data={
                        "userid": username,
                        "password": password,
                        "email": email,
                        "displayName": display_name,
                    },
                    headers={"OCS-APIRequest": "true"},
                )

                if response.status_code in [200, 201]:
                    logger.info("nextcloud_user_created", username=username, email=email)
                    return True
                else:
                    logger.error(
                        "nextcloud_user_creation_failed",
                        username=username,
                        status_code=response.status_code,
                        response=response.text,
                    )
                    return False

        except Exception as e:
            logger.error("nextcloud_create_user_error", username=username, error=str(e))
            return False

    async def user_exists(self, username: str) -> bool:
        """
        Check if a user exists in Nextcloud

        Args:
            username: Nextcloud username to check

        Returns:
            True if user exists, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/ocs/v1.php/cloud/users/{username}",
                    auth=(self.admin_user, self.admin_password),
                    headers={"OCS-APIRequest": "true"},
                )
                return response.status_code == 200

        except Exception as e:
            logger.error("nextcloud_user_exists_check_error", username=username, error=str(e))
            return False

    async def get_user_info(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Get user information from Nextcloud

        Args:
            username: Nextcloud username

        Returns:
            User information dictionary or None if not found
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/ocs/v1.php/cloud/users/{username}",
                    auth=(self.admin_user, self.admin_password),
                    headers={"OCS-APIRequest": "true"},
                )

                if response.status_code == 200:
                    return response.json().get("ocs", {}).get("data", {})
                return None

        except Exception as e:
            logger.error("nextcloud_get_user_info_error", username=username, error=str(e))
            return None

    async def get_user_quota(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Get user's storage quota information

        Args:
            username: Nextcloud username

        Returns:
            Quota information dictionary with 'free', 'used', 'total', 'relative' keys
        """
        user_info = await self.get_user_info(username)
        if user_info:
            return user_info.get("quota", {})
        return None

    async def enable_user(self, username: str) -> bool:
        """
        Enable a user account in Nextcloud

        Args:
            username: Nextcloud username

        Returns:
            True if successful, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.put(
                    f"{self.base_url}/ocs/v1.php/cloud/users/{username}/enable",
                    auth=(self.admin_user, self.admin_password),
                    headers={"OCS-APIRequest": "true"},
                )
                return response.status_code == 200

        except Exception as e:
            logger.error("nextcloud_enable_user_error", username=username, error=str(e))
            return False

    async def disable_user(self, username: str) -> bool:
        """
        Disable a user account in Nextcloud

        Args:
            username: Nextcloud username

        Returns:
            True if successful, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.put(
                    f"{self.base_url}/ocs/v1.php/cloud/users/{username}/disable",
                    auth=(self.admin_user, self.admin_password),
                    headers={"OCS-APIRequest": "true"},
                )
                return response.status_code == 200

        except Exception as e:
            logger.error("nextcloud_disable_user_error", username=username, error=str(e))
            return False

    async def delete_user(self, username: str) -> bool:
        """
        Delete a user from Nextcloud

        Args:
            username: Nextcloud username

        Returns:
            True if successful, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.delete(
                    f"{self.base_url}/ocs/v1.php/cloud/users/{username}",
                    auth=(self.admin_user, self.admin_password),
                    headers={"OCS-APIRequest": "true"},
                )
                return response.status_code == 200

        except Exception as e:
            logger.error("nextcloud_delete_user_error", username=username, error=str(e))
            return False


# Global Nextcloud service instance
nextcloud_service = NextcloudService()


# Helper function to check Nextcloud connection
async def check_nextcloud_connection() -> bool:
    """Check if Nextcloud is accessible"""
    return await nextcloud_service.health_check()
