"""
VoiceAssist V2 - Nextcloud File Tool

Handles file operations via WebDAV (Nextcloud Files).

Tools:
- search_nextcloud_files: Search files by name or content
- retrieve_nextcloud_file: Retrieve file contents
"""

import io
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Optional
from urllib.parse import quote, unquote

import httpx
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.tools.base import ToolCategory, RiskLevel, ToolDefinition, ToolResult

logger = logging.getLogger(__name__)


# ============================================================================
# WebDAV Client Helper Functions
# ============================================================================

def _get_webdav_url(username: str) -> str:
    """Build WebDAV URL for Nextcloud files."""
    settings = get_settings()
    base_url = settings.nextcloud_base_url.rstrip("/")
    return f"{base_url}/remote.php/dav/files/{quote(username)}/"


def _get_auth() -> tuple[str, str]:
    """Get Nextcloud authentication credentials."""
    settings = get_settings()
    return (settings.nextcloud_username, settings.nextcloud_password)


def _parse_webdav_response(xml_text: str, base_url: str) -> List["NextcloudFile"]:
    """Parse WebDAV PROPFIND XML response into NextcloudFile objects."""
    files = []

    # Parse XML - handle namespaces
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning(f"Failed to parse WebDAV response: {e}")
        return files

    # Define namespace prefixes
    namespaces = {
        "d": "DAV:",
        "oc": "http://owncloud.org/ns",
        "nc": "http://nextcloud.org/ns",
    }

    # Find all response elements
    for response in root.findall(".//d:response", namespaces):
        try:
            # Get href (path)
            href_elem = response.find("d:href", namespaces)
            if href_elem is None or not href_elem.text:
                continue

            href = unquote(href_elem.text)

            # Skip directories (end with /)
            if href.endswith("/"):
                continue

            # Get properties
            propstat = response.find("d:propstat", namespaces)
            if propstat is None:
                continue

            prop = propstat.find("d:prop", namespaces)
            if prop is None:
                continue

            # Extract file properties
            displayname = prop.find("d:displayname", namespaces)
            name = displayname.text if displayname is not None and displayname.text else href.split("/")[-1]

            getcontentlength = prop.find("d:getcontentlength", namespaces)
            size = int(getcontentlength.text) if getcontentlength is not None and getcontentlength.text else 0

            getcontenttype = prop.find("d:getcontenttype", namespaces)
            mime_type = getcontenttype.text if getcontenttype is not None and getcontenttype.text else "application/octet-stream"

            getlastmodified = prop.find("d:getlastmodified", namespaces)
            modified = ""
            if getlastmodified is not None and getlastmodified.text:
                try:
                    # Parse RFC 2822 date format
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(getlastmodified.text)
                    modified = dt.isoformat() + "Z"
                except Exception:
                    modified = getlastmodified.text

            # Get file ID from ownCloud namespace
            fileid = prop.find("oc:fileid", namespaces)
            file_id = fileid.text if fileid is not None and fileid.text else href

            # Extract path from href
            path = href
            if "/remote.php/dav/files/" in path:
                path = "/" + path.split("/remote.php/dav/files/")[1].split("/", 1)[-1]

            files.append(NextcloudFile(
                file_id=str(file_id),
                name=name,
                path=path,
                size=size,
                mime_type=mime_type,
                modified=modified,
                url=f"{base_url.rstrip('/')}{href}"
            ))

        except Exception as e:
            logger.warning(f"Error parsing WebDAV response element: {e}")
            continue

    return files


async def _webdav_search(
    webdav_url: str,
    auth: tuple[str, str],
    query: str,
    file_type: Optional[str] = None,
    max_results: int = 20,
) -> List["NextcloudFile"]:
    """
    Search files using WebDAV PROPFIND with filtering.

    Args:
        webdav_url: WebDAV base URL
        auth: (username, password) tuple
        query: Search query
        file_type: Optional file extension filter
        max_results: Maximum results to return

    Returns:
        List of NextcloudFile objects
    """
    # Use PROPFIND to list all files (Nextcloud doesn't support SEARCH well)
    propfind_body = """<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:getlastmodified/>
    <oc:fileid/>
  </d:prop>
</d:propfind>"""

    headers = {
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": "infinity",  # Search all subdirectories
    }

    settings = get_settings()
    base_url = settings.nextcloud_base_url

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method="PROPFIND",
            url=webdav_url,
            content=propfind_body,
            headers=headers,
            auth=auth,
        )
        response.raise_for_status()

    # Parse response
    all_files = _parse_webdav_response(response.text, base_url)

    # Filter by query (case-insensitive name match)
    query_lower = query.lower()
    filtered_files = [
        f for f in all_files
        if query_lower in f.name.lower() or query_lower in f.path.lower()
    ]

    # Filter by file type if specified
    if file_type:
        ext = file_type.lower().lstrip(".")
        filtered_files = [f for f in filtered_files if f.name.lower().endswith(f".{ext}")]

    # Sort by modified date (newest first) and limit results
    filtered_files.sort(key=lambda f: f.modified, reverse=True)
    return filtered_files[:max_results]


async def _webdav_get_file(
    file_url: str,
    auth: tuple[str, str],
) -> bytes:
    """
    Download file contents via WebDAV GET.

    Args:
        file_url: Full WebDAV URL to file
        auth: (username, password) tuple

    Returns:
        File contents as bytes
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(
            url=file_url,
            auth=auth,
        )
        response.raise_for_status()
        return response.content


def _extract_text_from_pdf(content: bytes, max_chars: int = 10000) -> tuple[str, bool]:
    """Extract text from PDF bytes."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        text_parts = []
        total_chars = 0

        for page in reader.pages:
            page_text = page.extract_text() or ""
            if total_chars + len(page_text) > max_chars:
                # Truncate at max_chars
                remaining = max_chars - total_chars
                text_parts.append(page_text[:remaining])
                return "\n".join(text_parts), True
            text_parts.append(page_text)
            total_chars += len(page_text)

        return "\n".join(text_parts), False
    except ImportError:
        logger.warning("pypdf not installed, cannot extract PDF text")
        return "", False
    except Exception as e:
        logger.warning(f"Error extracting PDF text: {e}")
        return "", False


def _extract_text_from_docx(content: bytes, max_chars: int = 10000) -> tuple[str, bool]:
    """Extract text from DOCX bytes."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        text_parts = []
        total_chars = 0

        for para in doc.paragraphs:
            para_text = para.text
            if total_chars + len(para_text) > max_chars:
                remaining = max_chars - total_chars
                text_parts.append(para_text[:remaining])
                return "\n".join(text_parts), True
            text_parts.append(para_text)
            total_chars += len(para_text)

        return "\n".join(text_parts), False
    except ImportError:
        logger.warning("python-docx not installed, cannot extract DOCX text")
        return "", False
    except Exception as e:
        logger.warning(f"Error extracting DOCX text: {e}")
        return "", False


def _extract_text(content: bytes, mime_type: str, max_chars: int = 10000) -> tuple[str, bool]:
    """Extract text from file based on mime type."""
    if "pdf" in mime_type.lower():
        return _extract_text_from_pdf(content, max_chars)
    elif "wordprocessingml" in mime_type.lower() or mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_text_from_docx(content, max_chars)
    elif mime_type.startswith("text/") or mime_type in ("application/json", "application/xml"):
        # Plain text files
        try:
            text = content.decode("utf-8")
            if len(text) > max_chars:
                return text[:max_chars], True
            return text, False
        except UnicodeDecodeError:
            return "", False
    else:
        return "", False


# ============================================================================
# Tool 3: Search Nextcloud Files
# ============================================================================

class SearchNextcloudFilesArgs(BaseModel):
    """Arguments for search_nextcloud_files tool"""
    query: str = Field(..., min_length=1, max_length=200, description="Search query")
    file_type: Optional[str] = Field(None, description="Filter by file type (pdf, docx, txt, etc.)")
    max_results: Optional[int] = Field(20, ge=1, le=100, description="Maximum results")
    include_content: bool = Field(False, description="Search file contents (slower)")


class NextcloudFile(BaseModel):
    """Nextcloud file model"""
    file_id: str
    name: str
    path: str
    size: int  # bytes
    mime_type: str
    modified: str  # ISO 8601 datetime
    url: str  # WebDAV URL


class SearchNextcloudFilesResult(BaseModel):
    """Result from search_nextcloud_files"""
    files: List[NextcloudFile]
    total_count: int
    query: str


SEARCH_NEXTCLOUD_FILES_DEF = ToolDefinition(
    name="search_nextcloud_files",
    description="Search for files in Nextcloud by name or content. Use this to find documents, PDFs, notes, and other files stored in Nextcloud.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query (filename or content keywords)",
                "minLength": 1,
                "maxLength": 200
            },
            "file_type": {
                "type": "string",
                "description": "Filter by file type (e.g., 'pdf', 'docx', 'txt')"
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results (1-100)",
                "minimum": 1,
                "maximum": 100,
                "default": 20
            },
            "include_content": {
                "type": "boolean",
                "description": "Search file contents (slower but more accurate)",
                "default": False
            }
        },
        "required": ["query"]
    },
    category=ToolCategory.FILE,
    requires_phi=True,  # Files may contain PHI
    requires_confirmation=False,  # Read-only
    risk_level=RiskLevel.LOW,
    rate_limit=20,  # 20 calls/minute
    timeout_seconds=15
)


def search_files(args: SearchNextcloudFilesArgs, user_id: int) -> ToolResult:
    """
    Search Nextcloud files using WebDAV.

    Args:
        args: Validated arguments
        user_id: User ID making the request

    Returns:
        ToolResult with list of matching files
    """
    import asyncio

    start_time = datetime.utcnow()

    try:
        logger.info(f"Searching Nextcloud files for user {user_id}: query='{args.query}'")

        settings = get_settings()

        # Check if Nextcloud is configured
        if not settings.nextcloud_username or not settings.nextcloud_password:
            logger.warning("Nextcloud credentials not configured, returning empty results")
            result_data = SearchNextcloudFilesResult(
                files=[],
                total_count=0,
                query=args.query
            )
            execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            return ToolResult(
                tool_name="search_nextcloud_files",
                success=True,
                result=result_data.dict(),
                execution_time_ms=execution_time
            )

        webdav_url = _get_webdav_url(settings.nextcloud_username)
        auth = _get_auth()

        async def _search():
            return await _webdav_search(
                webdav_url=webdav_url,
                auth=auth,
                query=args.query,
                file_type=args.file_type,
                max_results=args.max_results or 20,
            )

        # Run async search
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _search())
                files = future.result(timeout=35)
        else:
            files = asyncio.run(_search())

        result_data = SearchNextcloudFilesResult(
            files=files,
            total_count=len(files),
            query=args.query
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Nextcloud search completed in {execution_time:.2f}ms, "
            f"found {len(files)} files"
        )

        return ToolResult(
            tool_name="search_nextcloud_files",
            success=True,
            result=result_data.dict(),
            execution_time_ms=execution_time
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"WebDAV HTTP error: {e}")
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="search_nextcloud_files",
            success=False,
            error=f"Nextcloud server error: {e.response.status_code}",
            execution_time_ms=execution_time
        )
    except httpx.TimeoutException:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="search_nextcloud_files",
            success=False,
            error="Nextcloud request timed out",
            execution_time_ms=execution_time
        )
    except Exception as e:
        logger.error(f"Error searching Nextcloud files: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="search_nextcloud_files",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


# ============================================================================
# Tool 4: Retrieve Nextcloud File
# ============================================================================

class RetrieveNextcloudFileArgs(BaseModel):
    """Arguments for retrieve_nextcloud_file tool"""
    file_id: str = Field(..., description="File ID from search results")
    extract_text: bool = Field(True, description="Extract text from PDF/DOCX")
    max_chars: Optional[int] = Field(10000, ge=100, le=50000, description="Maximum characters to extract")


class RetrieveNextcloudFileResult(BaseModel):
    """Result from retrieve_nextcloud_file"""
    file_id: str
    name: str
    content: Optional[str] = None
    content_truncated: bool = False
    mime_type: str
    size: int
    url: str


RETRIEVE_NEXTCLOUD_FILE_DEF = ToolDefinition(
    name="retrieve_nextcloud_file",
    description="Retrieve the contents of a specific Nextcloud file. Can extract text from PDFs and DOCX files.",
    parameters={
        "type": "object",
        "properties": {
            "file_id": {
                "type": "string",
                "description": "File ID (from search results)"
            },
            "extract_text": {
                "type": "boolean",
                "description": "Extract text from PDF/DOCX files",
                "default": True
            },
            "max_chars": {
                "type": "integer",
                "description": "Maximum characters to extract (100-50000)",
                "minimum": 100,
                "maximum": 50000,
                "default": 10000
            }
        },
        "required": ["file_id"]
    },
    category=ToolCategory.FILE,
    requires_phi=True,  # File may contain PHI
    requires_confirmation=False,  # Read-only
    risk_level=RiskLevel.LOW,
    rate_limit=10,  # 10 calls/minute
    timeout_seconds=30
)


def retrieve_file(args: RetrieveNextcloudFileArgs, user_id: int) -> ToolResult:
    """
    Retrieve Nextcloud file contents using WebDAV.

    Downloads the file and optionally extracts text from PDF/DOCX files.

    Args:
        args: Validated arguments
        user_id: User ID making the request

    Returns:
        ToolResult with file contents
    """
    import asyncio

    start_time = datetime.utcnow()

    try:
        logger.info(f"Retrieving Nextcloud file for user {user_id}: file_id={args.file_id}")

        settings = get_settings()

        # Check if Nextcloud is configured
        if not settings.nextcloud_username or not settings.nextcloud_password:
            return ToolResult(
                tool_name="retrieve_nextcloud_file",
                success=False,
                error="Nextcloud not configured. Please set credentials.",
                execution_time_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )

        auth = _get_auth()

        # First, search for the file to get its details
        webdav_url = _get_webdav_url(settings.nextcloud_username)

        async def _find_file():
            # Use PROPFIND to find the file by ID
            return await _webdav_search(
                webdav_url=webdav_url,
                auth=auth,
                query=args.file_id,  # Search by file ID
                max_results=100,
            )

        # Run async search
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _find_file())
                files = future.result(timeout=35)
        else:
            files = asyncio.run(_find_file())

        # Find the matching file by ID
        target_file = None
        for f in files:
            if f.file_id == args.file_id or args.file_id in f.path:
                target_file = f
                break

        if not target_file:
            return ToolResult(
                tool_name="retrieve_nextcloud_file",
                success=False,
                error=f"File not found: {args.file_id}",
                execution_time_ms=(datetime.utcnow() - start_time).total_seconds() * 1000
            )

        # Download the file
        async def _download():
            return await _webdav_get_file(target_file.url, auth)

        if loop and loop.is_running():
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _download())
                content_bytes = future.result(timeout=65)
        else:
            content_bytes = asyncio.run(_download())

        # Extract text if requested
        content = None
        truncated = False
        if args.extract_text:
            content, truncated = _extract_text(
                content_bytes,
                target_file.mime_type,
                args.max_chars or 10000
            )

        result_data = RetrieveNextcloudFileResult(
            file_id=target_file.file_id,
            name=target_file.name,
            content=content,
            content_truncated=truncated,
            mime_type=target_file.mime_type,
            size=len(content_bytes),
            url=target_file.url
        )

        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Retrieved file '{target_file.name}' ({len(content_bytes)} bytes) "
            f"in {execution_time:.2f}ms"
        )

        return ToolResult(
            tool_name="retrieve_nextcloud_file",
            success=True,
            result=result_data.dict(),
            execution_time_ms=execution_time
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"WebDAV HTTP error retrieving file: {e}")
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="retrieve_nextcloud_file",
            success=False,
            error=f"Nextcloud server error: {e.response.status_code}",
            execution_time_ms=execution_time
        )
    except httpx.TimeoutException:
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="retrieve_nextcloud_file",
            success=False,
            error="File download timed out",
            execution_time_ms=execution_time
        )
    except Exception as e:
        logger.error(f"Error retrieving Nextcloud file: {e}", exc_info=True)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        return ToolResult(
            tool_name="retrieve_nextcloud_file",
            success=False,
            error=str(e),
            execution_time_ms=execution_time
        )


# ============================================================================
# Tool Registration
# ============================================================================

def register_nextcloud_tools():
    """Register all Nextcloud tools with the tool registry"""
    from app.tools.registry import register_tool

    register_tool(
        name="search_nextcloud_files",
        definition=SEARCH_NEXTCLOUD_FILES_DEF,
        model=SearchNextcloudFilesArgs,
        handler=search_files
    )

    register_tool(
        name="retrieve_nextcloud_file",
        definition=RETRIEVE_NEXTCLOUD_FILE_DEF,
        model=RetrieveNextcloudFileArgs,
        handler=retrieve_file
    )

    logger.info("Nextcloud tools registered")
