"""
Nextcloud File Auto-Indexer (Phase 6)

Monitors Nextcloud files via WebDAV and automatically indexes medical documents
into the VoiceAssist knowledge base. Provides seamless integration between
Nextcloud storage and the RAG system.

MVP Implementation:
- WebDAV connection to Nextcloud
- File discovery in specified directories
- Automatic document ingestion for supported file types
- Indexed file tracking to prevent re-indexing
- Manual trigger API for selective indexing

Future enhancements:
- Real-time file watching with webhooks
- Incremental sync and update detection
- Metadata extraction from Nextcloud tags/comments
- Multi-user file permissions and filtering
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass
from pathlib import Path

from webdav3.client import Client as WebDAVClient
from webdav3.exceptions import WebDavException

# Import KB indexer from Phase 5
from app.services.kb_indexer import KBIndexer, IndexingResult

logger = logging.getLogger(__name__)


@dataclass
class NextcloudFile:
    """Represents a file in Nextcloud."""
    path: str
    name: str
    size: int
    modified: datetime
    content_type: Optional[str] = None
    is_directory: bool = False


class NextcloudFileIndexer:
    """
    Nextcloud file auto-indexer service.

    Discovers medical documents in Nextcloud and automatically indexes them
    into the knowledge base using the KBIndexer from Phase 5.
    """

    # Supported file extensions for indexing
    SUPPORTED_EXTENSIONS = {'.pdf', '.txt', '.md'}

    def __init__(
        self,
        webdav_url: str,
        username: str,
        password: str,
        qdrant_url: str = "http://qdrant:6333",
        collection_name: str = "medical_kb",
        watch_directories: Optional[List[str]] = None
    ):
        """
        Initialize Nextcloud file indexer.

        Args:
            webdav_url: Nextcloud WebDAV endpoint (e.g., https://nextcloud.local/remote.php/dav/files/username/)
            username: Nextcloud username
            password: Nextcloud password
            qdrant_url: Qdrant vector database URL
            collection_name: Qdrant collection for indexed documents
            watch_directories: List of directories to monitor (e.g., ['Medical Documents', 'Guidelines'])
        """
        self.webdav_url = webdav_url
        self.username = username
        self.password = password

        # WebDAV client
        self.webdav_client = WebDAVClient({
            'webdav_hostname': webdav_url,
            'webdav_login': username,
            'webdav_password': password,
            'webdav_timeout': 30
        })

        # KB Indexer from Phase 5
        self.kb_indexer = KBIndexer(
            qdrant_url=qdrant_url,
            collection_name=collection_name
        )

        # Directories to watch for new files
        self.watch_directories = watch_directories or ['Medical Documents']

        # Track indexed files to prevent re-indexing
        self.indexed_files: Set[str] = set()

    def connect(self) -> bool:
        """
        Test connection to Nextcloud WebDAV.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            # Test connection by listing root
            self.webdav_client.list()
            logger.info(f"Successfully connected to Nextcloud WebDAV: {self.webdav_url}")
            return True

        except WebDavException as e:
            logger.error(f"Failed to connect to Nextcloud WebDAV: {e}", exc_info=True)
            return False

    def list_files(
        self,
        directory: str = "/",
        recursive: bool = True
    ) -> List[NextcloudFile]:
        """
        List files in a Nextcloud directory.

        Args:
            directory: Directory path to list
            recursive: Whether to recurse into subdirectories

        Returns:
            List of NextcloudFile objects
        """
        try:
            files = []

            # Get directory listing
            items = self.webdav_client.list(directory, get_info=True)

            for item in items:
                # Skip self-reference
                if item['path'] == directory:
                    continue

                # Parse item info
                is_dir = item.get('isdir', False)
                file_path = item['path']

                if is_dir:
                    # Recurse into subdirectory if requested
                    if recursive:
                        subfiles = self.list_files(file_path, recursive=True)
                        files.extend(subfiles)
                else:
                    # Add file to list
                    nextcloud_file = NextcloudFile(
                        path=file_path,
                        name=Path(file_path).name,
                        size=item.get('size', 0),
                        modified=datetime.fromisoformat(item.get('modified', datetime.now().isoformat())),
                        content_type=item.get('content_type'),
                        is_directory=False
                    )
                    files.append(nextcloud_file)

            logger.info(f"Found {len(files)} files in {directory}")
            return files

        except WebDavException as e:
            logger.error(f"Error listing files in {directory}: {e}", exc_info=True)
            return []

    def should_index_file(self, file: NextcloudFile) -> bool:
        """
        Determine if a file should be indexed.

        Args:
            file: NextcloudFile to check

        Returns:
            True if file should be indexed, False otherwise
        """
        # Skip if already indexed
        if file.path in self.indexed_files:
            logger.debug(f"File already indexed: {file.path}")
            return False

        # Check file extension
        file_ext = Path(file.name).suffix.lower()
        if file_ext not in self.SUPPORTED_EXTENSIONS:
            logger.debug(f"Unsupported file type: {file.name} ({file_ext})")
            return False

        # Check file size (skip very large files > 50MB)
        max_size = 50 * 1024 * 1024  # 50MB
        if file.size > max_size:
            logger.warning(f"File too large to index: {file.name} ({file.size} bytes)")
            return False

        return True

    async def index_file(
        self,
        file: NextcloudFile,
        source_type: str = "note"
    ) -> Optional[IndexingResult]:
        """
        Index a single file into the knowledge base.

        Args:
            file: NextcloudFile to index
            source_type: Document source type (textbook, journal, guideline, note)

        Returns:
            IndexingResult if successful, None otherwise
        """
        try:
            # Download file content
            logger.info(f"Downloading file for indexing: {file.name}")
            file_bytes = self.webdav_client.resource(file.path).read()

            # Determine file type and index appropriately
            file_ext = Path(file.name).suffix.lower()

            if file_ext == '.pdf':
                # Index PDF
                result = await self.kb_indexer.index_pdf_document(
                    pdf_bytes=file_bytes,
                    document_id=f"nextcloud-{file.path}",
                    title=file.name,
                    source_type=source_type,
                    metadata={
                        "nextcloud_path": file.path,
                        "nextcloud_size": file.size,
                        "nextcloud_modified": file.modified.isoformat(),
                        "indexed_at": datetime.utcnow().isoformat()
                    }
                )

            elif file_ext in {'.txt', '.md'}:
                # Index text file
                content = file_bytes.decode('utf-8', errors='ignore')
                result = await self.kb_indexer.index_document(
                    content=content,
                    document_id=f"nextcloud-{file.path}",
                    title=file.name,
                    source_type=source_type,
                    metadata={
                        "nextcloud_path": file.path,
                        "nextcloud_size": file.size,
                        "nextcloud_modified": file.modified.isoformat(),
                        "indexed_at": datetime.utcnow().isoformat()
                    }
                )

            else:
                logger.warning(f"Unsupported file type: {file.name}")
                return None

            if result and result.success:
                # Mark as indexed
                self.indexed_files.add(file.path)
                logger.info(
                    f"Successfully indexed {file.name}: "
                    f"{result.chunks_indexed} chunks in {result.processing_time_ms:.2f}ms"
                )

            return result

        except Exception as e:
            logger.error(f"Error indexing file {file.name}: {e}", exc_info=True)
            return None

    async def scan_and_index(
        self,
        source_type: str = "note",
        force_reindex: bool = False
    ) -> Dict[str, Any]:
        """
        Scan watch directories and index all supported files.

        Args:
            source_type: Default source type for indexed documents
            force_reindex: If True, re-index files even if already indexed

        Returns:
            Summary dictionary with indexing statistics
        """
        logger.info("Starting Nextcloud file scan and indexing")

        total_files = 0
        indexed_files = 0
        skipped_files = 0
        failed_files = 0

        if force_reindex:
            self.indexed_files.clear()
            logger.info("Force re-index enabled: clearing indexed file cache")

        # Scan each watch directory
        for watch_dir in self.watch_directories:
            logger.info(f"Scanning directory: {watch_dir}")

            # List files in directory
            files = self.list_files(watch_dir, recursive=True)
            total_files += len(files)

            # Index each file
            for file in files:
                if not self.should_index_file(file):
                    skipped_files += 1
                    continue

                result = await self.index_file(file, source_type=source_type)

                if result and result.success:
                    indexed_files += 1
                else:
                    failed_files += 1

        summary = {
            "scan_completed": datetime.utcnow().isoformat(),
            "watch_directories": self.watch_directories,
            "total_files_found": total_files,
            "files_indexed": indexed_files,
            "files_skipped": skipped_files,
            "files_failed": failed_files
        }

        logger.info(
            f"Indexing complete: {indexed_files}/{total_files} files indexed, "
            f"{skipped_files} skipped, {failed_files} failed"
        )

        return summary

    async def index_specific_file(
        self,
        file_path: str,
        source_type: str = "note"
    ) -> Optional[IndexingResult]:
        """
        Index a specific file by path.

        Args:
            file_path: Nextcloud file path
            source_type: Document source type

        Returns:
            IndexingResult if successful, None otherwise
        """
        try:
            # Get file info
            info = self.webdav_client.info(file_path)

            file = NextcloudFile(
                path=file_path,
                name=Path(file_path).name,
                size=info.get('size', 0),
                modified=datetime.fromisoformat(info.get('modified', datetime.now().isoformat())),
                content_type=info.get('content_type'),
                is_directory=False
            )

            # Index the file
            return await self.index_file(file, source_type=source_type)

        except WebDavException as e:
            logger.error(f"Error indexing specific file {file_path}: {e}", exc_info=True)
            return None
