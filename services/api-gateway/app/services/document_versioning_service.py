"""
Document Versioning Service for tracking document versions and freshness.

Provides:
- Version management for knowledge base documents
- Freshness checking and alerts
- Source URL monitoring
- Content change tracking
"""

import hashlib
import os
import uuid
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import aiohttp  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    aiohttp = None  # type: ignore
from app.core.config import settings
from app.core.logging import get_logger
from app.models.document import Document
from app.models.document_version import DocumentVersion, FreshnessAlert
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

logger = get_logger(__name__)


class DocumentVersioningService:
    """
    Manages document versions and freshness tracking.

    Handles version creation, freshness checking, and alerts
    for knowledge base documents.
    """

    # Freshness thresholds (in days)
    STALE_THRESHOLD_DAYS = 365 * 2  # 2 years
    WARNING_THRESHOLD_DAYS = 365  # 1 year
    REVIEW_THRESHOLD_DAYS = 180  # 6 months

    # Storage paths
    VERSIONS_BASE_PATH = getattr(settings, "VERSIONS_STORAGE_PATH", "./uploads/versions")

    def __init__(self, db: Session):
        self.db = db

    async def create_version(
        self,
        document_id: str,
        file_bytes: bytes,
        change_type: str = "update",
        change_summary: Optional[str] = None,
        changed_by: Optional[str] = None,
        source_url: Optional[str] = None,
        source_published_date: Optional[date] = None,
    ) -> DocumentVersion:
        """
        Create a new version of a document.

        Args:
            document_id: UUID of the document
            file_bytes: New file content
            change_type: Type of change (initial, update, correction, superseded)
            change_summary: Description of changes
            changed_by: User ID making the change
            source_url: URL where document was sourced
            source_published_date: Publication date of source

        Returns:
            Created DocumentVersion record
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            raise ValueError("Invalid document ID")

        document = self.db.query(Document).filter(Document.id == doc_uuid).first()
        if not document:
            raise ValueError(f"Document {document_id} not found")

        # Get next version number
        current_max = (
            self.db.query(func.max(DocumentVersion.version_number))
            .filter(DocumentVersion.document_id == doc_uuid)
            .scalar()
            or 0
        )
        new_version_number = current_max + 1

        # Calculate content hash
        content_hash = hashlib.sha256(file_bytes).hexdigest()

        # Store version file
        file_path = self._store_version_file(document_id, new_version_number, file_bytes)

        # Calculate diff if previous version exists
        pages_added, pages_removed, pages_modified = await self._calculate_diff(
            document, file_bytes, new_version_number
        )

        # Create version record
        version = DocumentVersion(
            document_id=doc_uuid,
            version_number=new_version_number,
            change_type=change_type,
            change_summary=change_summary,
            changed_by=uuid.UUID(changed_by) if changed_by else None,
            content_hash=content_hash,
            file_path=file_path,
            file_size_bytes=len(file_bytes),
            enhanced_structure=document.enhanced_structure,
            source_url=source_url or document.source_url,
            source_published_date=source_published_date,
            source_accessed_date=date.today(),
            pages_added=pages_added,
            pages_removed=pages_removed,
            pages_modified=pages_modified,
        )
        self.db.add(version)

        # Update document metadata
        document.current_version = new_version_number
        document.content_hash = content_hash
        document.last_verified_at = datetime.utcnow()
        if source_url:
            document.source_url = source_url
        if source_published_date:
            document.published_date = source_published_date

        self.db.commit()
        logger.info(f"Created version {new_version_number} for document {document_id}")

        return version

    def _store_version_file(
        self,
        document_id: str,
        version_number: int,
        file_bytes: bytes,
    ) -> str:
        """Store version file to disk."""
        version_dir = Path(self.VERSIONS_BASE_PATH) / document_id
        version_dir.mkdir(parents=True, exist_ok=True)

        file_path = version_dir / f"v{version_number}.pdf"
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        return str(file_path)

    async def _calculate_diff(
        self,
        document: Document,
        new_file_bytes: bytes,
        new_version: int,
    ) -> Tuple[int, int, int]:
        """
        Calculate page differences between versions.

        Returns tuple of (pages_added, pages_removed, pages_modified)
        """
        if new_version == 1:
            # Initial version - count all pages as added
            try:
                import pdfplumber

                with pdfplumber.open(new_file_bytes) as pdf:
                    return len(pdf.pages), 0, 0
            except Exception:
                return 0, 0, 0

        # For subsequent versions, compare page counts
        old_pages = document.total_pages or 0

        try:
            import pdfplumber
            from io import BytesIO

            with pdfplumber.open(BytesIO(new_file_bytes)) as pdf:
                new_pages = len(pdf.pages)

            if new_pages > old_pages:
                return new_pages - old_pages, 0, min(old_pages, new_pages)
            elif new_pages < old_pages:
                return 0, old_pages - new_pages, min(old_pages, new_pages)
            else:
                # Same page count - assume all modified
                return 0, 0, new_pages

        except Exception as e:
            logger.warning(f"Failed to calculate diff: {e}")
            return 0, 0, 0

    async def check_freshness(self, document_id: str) -> Dict[str, Any]:
        """
        Check document freshness and create alerts if needed.

        Args:
            document_id: UUID of the document

        Returns:
            Dict with freshness status and any new alerts
        """
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return {"status": "error", "message": "Invalid document ID"}

        document = self.db.query(Document).filter(Document.id == doc_uuid).first()
        if not document:
            return {"status": "not_found"}

        now = datetime.utcnow()
        today = date.today()
        alerts = []

        # Check age based on published date
        if document.published_date:
            age_days = (today - document.published_date).days

            if age_days > self.STALE_THRESHOLD_DAYS:
                document.freshness_status = "stale"
                alerts.append({
                    "type": "stale",
                    "severity": "warning",
                    "message": f"Document is {age_days // 365} years old. Consider updating with newer edition.",
                })
            elif age_days > self.WARNING_THRESHOLD_DAYS:
                document.freshness_status = "aging"
                alerts.append({
                    "type": "aging",
                    "severity": "info",
                    "message": f"Document is over {age_days // 365} year(s) old. Review for accuracy.",
                })
            else:
                document.freshness_status = "current"

        # Check last verification date
        if document.last_verified_at:
            days_since_verify = (now - document.last_verified_at.replace(tzinfo=None)).days
            if days_since_verify > self.REVIEW_THRESHOLD_DAYS:
                alerts.append({
                    "type": "review_needed",
                    "severity": "info",
                    "message": f"Document not verified in {days_since_verify} days.",
                })

        # Check source URL if available and auto-update enabled
        if document.source_url and document.auto_update_enabled:
            source_check = await self._check_source_url(document.source_url, document.content_hash)
            if source_check.get("changed"):
                alerts.append({
                    "type": "source_changed",
                    "severity": "critical",
                    "message": "Source URL content has changed since last fetch.",
                    "details": source_check,
                })

        # Create alert records for new alerts
        for alert_data in alerts:
            existing = (
                self.db.query(FreshnessAlert)
                .filter(
                    and_(
                        FreshnessAlert.document_id == doc_uuid,
                        FreshnessAlert.alert_type == alert_data["type"],
                        FreshnessAlert.acknowledged == False,
                    )
                )
                .first()
            )

            if not existing:
                alert = FreshnessAlert(
                    document_id=doc_uuid,
                    alert_type=alert_data["type"],
                    severity=alert_data["severity"],
                    message=alert_data["message"],
                    source_check_result=alert_data.get("details"),
                )
                self.db.add(alert)

        document.last_verified_at = now
        self.db.commit()

        return {
            "status": document.freshness_status,
            "published_date": document.published_date.isoformat() if document.published_date else None,
            "last_verified_at": document.last_verified_at.isoformat() if document.last_verified_at else None,
            "current_version": document.current_version,
            "alerts": alerts,
        }

    async def _check_source_url(
        self,
        source_url: str,
        current_hash: Optional[str],
    ) -> Dict[str, Any]:
        """
        Check if source URL content has changed.

        Args:
            source_url: URL to check
            current_hash: Current content hash

        Returns:
            Dict with change status and details
        """
        if aiohttp is None:
            # Optional dependency is not installed; treat as unreachable but non-fatal.
            logger.warning(
                "Source URL check skipped for %s: aiohttp not installed",
                source_url,
            )
            return {
                "reachable": False,
                "error": "aiohttp not installed",
                "changed": False,
            }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(
                    source_url, timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status != 200:
                        return {
                            "reachable": False,
                            "status_code": response.status,
                            "changed": False,
                        }

                    # Check Last-Modified or ETag
                    last_modified = response.headers.get("Last-Modified")
                    etag = response.headers.get("ETag")
                    content_length = response.headers.get("Content-Length")

                    return {
                        "reachable": True,
                        "last_modified": last_modified,
                        "etag": etag,
                        "content_length": content_length,
                        "changed": False,  # Would need to download and hash to confirm
                    }

        except Exception as e:
            logger.warning(f"Source URL check failed for {source_url}: {e}")
            return {
                "reachable": False,
                "error": str(e),
                "changed": False,
            }

    def get_version_history(
        self,
        document_id: str,
        limit: int = 20,
    ) -> List[DocumentVersion]:
        """Get version history for a document."""
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return []

        return (
            self.db.query(DocumentVersion)
            .filter(DocumentVersion.document_id == doc_uuid)
            .order_by(DocumentVersion.version_number.desc())
            .limit(limit)
            .all()
        )

    def get_version(
        self,
        document_id: str,
        version_number: int,
    ) -> Optional[DocumentVersion]:
        """Get specific version of a document."""
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            return None

        return (
            self.db.query(DocumentVersion)
            .filter(
                and_(
                    DocumentVersion.document_id == doc_uuid,
                    DocumentVersion.version_number == version_number,
                )
            )
            .first()
        )

    def get_unacknowledged_alerts(
        self,
        document_id: Optional[str] = None,
        severity: Optional[str] = None,
    ) -> List[FreshnessAlert]:
        """Get unacknowledged freshness alerts."""
        query = self.db.query(FreshnessAlert).filter(FreshnessAlert.acknowledged == False)

        if document_id:
            try:
                doc_uuid = uuid.UUID(document_id)
                query = query.filter(FreshnessAlert.document_id == doc_uuid)
            except ValueError:
                return []

        if severity:
            query = query.filter(FreshnessAlert.severity == severity)

        return query.order_by(FreshnessAlert.created_at.desc()).all()

    def acknowledge_alert(
        self,
        alert_id: str,
        user_id: str,
    ) -> bool:
        """Acknowledge a freshness alert."""
        try:
            alert_uuid = uuid.UUID(alert_id)
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            return False

        alert = self.db.query(FreshnessAlert).filter(FreshnessAlert.id == alert_uuid).first()
        if not alert:
            return False

        alert.acknowledge(user_uuid)
        self.db.commit()
        return True

    def supersede_document(
        self,
        old_document_id: str,
        new_document_id: str,
        user_id: Optional[str] = None,
    ) -> bool:
        """
        Mark a document as superseded by another.

        Args:
            old_document_id: Document being superseded
            new_document_id: New document that supersedes it
            user_id: User making the change

        Returns:
            True if successful
        """
        try:
            old_uuid = uuid.UUID(old_document_id)
            new_uuid = uuid.UUID(new_document_id)
        except ValueError:
            return False

        old_doc = self.db.query(Document).filter(Document.id == old_uuid).first()
        new_doc = self.db.query(Document).filter(Document.id == new_uuid).first()

        if not old_doc or not new_doc:
            return False

        # Update old document
        old_doc.superseded_by = new_uuid
        old_doc.freshness_status = "superseded"

        # Create alert
        alert = FreshnessAlert(
            document_id=old_uuid,
            alert_type="superseded",
            severity="info",
            message=f"Document has been superseded by '{new_doc.title}'",
            source_check_result={"new_document_id": new_document_id},
        )
        self.db.add(alert)

        self.db.commit()
        logger.info(f"Document {old_document_id} superseded by {new_document_id}")

        return True

    def get_freshness_stats(self) -> Dict[str, Any]:
        """Get aggregate freshness statistics."""
        status_counts = dict(
            self.db.query(Document.freshness_status, func.count(Document.id))
            .group_by(Document.freshness_status)
            .all()
        )

        alert_counts = dict(
            self.db.query(FreshnessAlert.severity, func.count(FreshnessAlert.id))
            .filter(FreshnessAlert.acknowledged == False)
            .group_by(FreshnessAlert.severity)
            .all()
        )

        return {
            "freshness_status": status_counts,
            "unacknowledged_alerts": alert_counts,
            "total_documents": sum(status_counts.values()),
            "total_alerts": sum(alert_counts.values()),
        }

    async def run_freshness_check_all(
        self,
        batch_size: int = 100,
    ) -> Dict[str, Any]:
        """
        Run freshness check on all documents.

        Args:
            batch_size: Number of documents to process

        Returns:
            Summary of results
        """
        documents = (
            self.db.query(Document)
            .filter(Document.freshness_status != "superseded")
            .limit(batch_size)
            .all()
        )

        results = {
            "checked": 0,
            "alerts_created": 0,
            "errors": [],
        }

        for doc in documents:
            try:
                result = await self.check_freshness(str(doc.id))
                results["checked"] += 1
                results["alerts_created"] += len(result.get("alerts", []))
            except Exception as e:
                results["errors"].append({
                    "document_id": str(doc.id),
                    "error": str(e),
                })

        return results


def get_document_versioning_service(db: Session) -> DocumentVersioningService:
    """Factory function to get DocumentVersioningService."""
    return DocumentVersioningService(db)
