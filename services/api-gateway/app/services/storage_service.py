"""
Storage service for file uploads (supports local and S3)
"""

import os
import uuid
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.core.logging import get_logger
from fastapi import UploadFile

logger = get_logger(__name__)


class StorageService:
    """
    Handle file storage operations.
    Supports both local filesystem and AWS S3.
    """

    def __init__(self):
        self.storage_type = os.getenv("STORAGE_TYPE", "local")  # 'local' or 's3'
        self.upload_dir = Path(os.getenv("UPLOAD_DIR", "./uploads"))

        if self.storage_type == "local":
            # Ensure upload directory exists
            self.upload_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Using local storage at {self.upload_dir}")
        elif self.storage_type == "s3":
            # Import boto3 only if using S3
            try:
                import boto3

                self.s3_client = boto3.client("s3")
                self.s3_bucket = os.getenv("AWS_S3_BUCKET")
                logger.info(f"Using S3 storage with bucket {self.s3_bucket}")
            except ImportError:
                logger.error("boto3 not installed. Install with: pip install boto3")
                raise

    async def upload_file(self, file: UploadFile, user_id: str, message_id: str) -> str:
        """
        Upload file and return URL.

        Args:
            file: UploadFile from FastAPI
            user_id: User ID
            message_id: Message ID

        Returns:
            str: File URL
        """
        # Generate unique filename
        file_ext = Path(file.filename).suffix
        unique_filename = f"{user_id}/{message_id}/{uuid.uuid4()}{file_ext}"

        if self.storage_type == "local":
            return await self._upload_local(file, unique_filename)
        elif self.storage_type == "s3":
            return await self._upload_s3(file, unique_filename)
        else:
            raise ValueError(f"Unknown storage type: {self.storage_type}")

    async def _upload_local(self, file: UploadFile, filename: str) -> str:
        """Upload file to local filesystem"""
        file_path = self.upload_dir / filename

        # Create directory if it doesn't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Write file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Return relative URL
        return f"/uploads/{filename}"

    async def _upload_s3(self, file: UploadFile, filename: str) -> str:
        """Upload file to S3"""
        content = await file.read()

        # Upload to S3
        self.s3_client.put_object(
            Bucket=self.s3_bucket,
            Key=filename,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )

        # Return S3 URL
        return f"https://{self.s3_bucket}.s3.amazonaws.com/{filename}"

    async def delete_file(self, file_url: str) -> bool:
        """
        Delete file from storage.

        Args:
            file_url: File URL

        Returns:
            bool: True if deleted successfully
        """
        try:
            if self.storage_type == "local":
                return await self._delete_local(file_url)
            elif self.storage_type == "s3":
                return await self._delete_s3(file_url)
            else:
                raise ValueError(f"Unknown storage type: {self.storage_type}")
        except Exception as e:
            logger.error(f"Error deleting file {file_url}: {e}")
            return False

    async def _delete_local(self, file_url: str) -> bool:
        """Delete file from local filesystem"""
        # Extract path from URL (remove /uploads/ prefix)
        file_path = self.upload_dir / file_url.replace("/uploads/", "")

        if file_path.exists():
            file_path.unlink()
            return True
        return False

    async def _delete_s3(self, file_url: str) -> bool:
        """Delete file from S3"""
        # Extract key from URL
        key = file_url.split(".amazonaws.com/")[-1]

        self.s3_client.delete_object(Bucket=self.s3_bucket, Key=key)
        return True

    async def get_file(self, file_url: str) -> Optional[bytes]:
        """
        Retrieve file content.

        Args:
            file_url: File URL

        Returns:
            bytes: File content or None if not found
        """
        try:
            if self.storage_type == "local":
                return await self._get_local(file_url)
            elif self.storage_type == "s3":
                return await self._get_s3(file_url)
            else:
                raise ValueError(f"Unknown storage type: {self.storage_type}")
        except Exception as e:
            logger.error(f"Error retrieving file {file_url}: {e}")
            return None

    async def _get_local(self, file_url: str) -> Optional[bytes]:
        """Get file from local filesystem"""
        file_path = self.upload_dir / file_url.replace("/uploads/", "")

        if file_path.exists():
            with open(file_path, "rb") as f:
                return f.read()
        return None

    async def _get_s3(self, file_url: str) -> Optional[bytes]:
        """Get file from S3"""
        key = file_url.split(".amazonaws.com/")[-1]

        response = self.s3_client.get_object(Bucket=self.s3_bucket, Key=key)
        return response["Body"].read()

    def get_file_size_limit(self) -> int:
        """Get max file size in bytes"""
        max_mb = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
        return max_mb * 1024 * 1024  # Convert MB to bytes

    def is_allowed_file_type(self, filename: str) -> bool:
        """Check if file type is allowed"""
        allowed_extensions = {
            ".pdf",
            ".txt",
            ".md",
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".doc",
            ".docx",
        }
        file_ext = Path(filename).suffix.lower()
        return file_ext in allowed_extensions


# Singleton instance
_storage_service = None


def get_storage_service() -> StorageService:
    """Get storage service instance"""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
