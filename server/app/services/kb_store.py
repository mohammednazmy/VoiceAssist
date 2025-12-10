"""In-memory knowledge base store used for admin endpoints.

This module keeps a lightweight, process-local registry of uploaded
knowledge documents along with their audit events. It is intentionally
stateful so that the demo admin panel can exercise upload, delete, and
reindex flows without requiring a backing database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import uuid4

# Maximum upload size enforced server-side (50 MiB)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Minimal allowlist of MIME types for KB uploads
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "application/json",
}


@dataclass
class AuditEvent:
    """Represents an audit trail event for a document."""

    action: str
    actor: str
    timestamp: datetime
    notes: Optional[str] = None
    error: Optional[str] = None
    id: str = field(default_factory=lambda: f"audit-{uuid4()}")

    def to_dict(self) -> Dict[str, str]:
        payload = {
            "id": self.id,
            "action": self.action,
            "actor": self.actor,
            "timestamp": self.timestamp.replace(tzinfo=timezone.utc).isoformat(),
        }
        if self.notes:
            payload["notes"] = self.notes
        if self.error:
            payload["error"] = self.error
        return payload


@dataclass
class KnowledgeDocumentRecord:
    """Internal document representation for the admin KB."""

    id: str
    name: str
    type: str
    source_type: str
    indexed: bool
    version: str
    status: str
    last_indexed_at: Optional[datetime]
    file_name: str
    mime_type: str
    size_bytes: int
    created_by: str
    error: Optional[str] = None

    def to_admin_shape(self) -> Dict[str, Optional[str]]:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "indexed": self.indexed,
            "version": self.version,
            "lastIndexedAt": self.last_indexed_at.replace(tzinfo=timezone.utc).isoformat()
            if self.last_indexed_at
            else None,
            "status": self.status,
            "sourceType": self.source_type,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "error": self.error,
        }


class KnowledgeBaseStore:
    """Process-local registry of knowledge documents and audit events."""

    def __init__(self) -> None:
        self._documents: Dict[str, KnowledgeDocumentRecord] = {}
        self._audit_events: Dict[str, List[AuditEvent]] = {}
        self._seed_demo_documents()

    def _seed_demo_documents(self) -> None:
        now = datetime.now(timezone.utc)
        demo_docs = [
            KnowledgeDocumentRecord(
                id="doc-harrisons-hf",
                name="Harrison's · Heart Failure",
                type="textbook",
                source_type="uploaded",
                indexed=True,
                version="v1",
                status="indexed",
                last_indexed_at=now - timedelta(days=1),
                file_name="harrisons-hf.pdf",
                mime_type="application/pdf",
                size_bytes=1_200_000,
                created_by="admin@example.com",
            ),
            KnowledgeDocumentRecord(
                id="doc-aha-2022-hf",
                name="AHA/ACC/HFSA 2022 HF Guideline",
                type="guideline",
                source_type="uploaded",
                indexed=True,
                version="v1",
                status="indexed",
                last_indexed_at=now - timedelta(days=1, minutes=5),
                file_name="aha-2022-hf.pdf",
                mime_type="application/pdf",
                size_bytes=2_500_000,
                created_by="admin@example.com",
            ),
        ]

        for doc in demo_docs:
            self._documents[doc.id] = doc
            self._audit_events[doc.id] = [
                AuditEvent(
                    action="uploaded",
                    actor=doc.created_by,
                    timestamp=doc.last_indexed_at - timedelta(minutes=5),
                    notes=f"Document {doc.file_name} uploaded",
                ),
                AuditEvent(
                    action="indexed",
                    actor="system/kb-indexer",
                    timestamp=doc.last_indexed_at,
                    notes="Initial indexing completed",
                ),
            ]

    @property
    def total_documents(self) -> int:
        """Return the total number of documents tracked by the store."""

        return len(self._documents)

    def list_documents(self, *, skip: int = 0, limit: Optional[int] = None) -> List[Dict[str, Optional[str]]]:
        docs = list(self._documents.values())
        sliced = docs[skip : skip + limit if limit is not None else None]
        return [doc.to_admin_shape() for doc in sliced]

    def get_document(self, doc_id: str) -> KnowledgeDocumentRecord:
        if doc_id not in self._documents:
            raise KeyError(doc_id)
        return self._documents[doc_id]

    def create_preflight(self, filename: str, mime_type: str) -> Dict[str, object]:
        if mime_type not in ALLOWED_MIME_TYPES:
            raise ValueError("Unsupported MIME type")
        token = str(uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        return {
            "upload_id": token,
            "upload_url": f"https://uploads.voiceassist.local/mock/{token}",
            "max_size_bytes": MAX_UPLOAD_BYTES,
            "allowed_mime_types": sorted(ALLOWED_MIME_TYPES),
            "expires_at": expires_at.isoformat(),
            "required_headers": {"Content-Type": mime_type},
            "fields": {"key": f"kb/{token}/{filename}"},
        }

    def add_document(
        self,
        *,
        title: str,
        source_type: str,
        file_name: str,
        mime_type: str,
        size_bytes: int,
        uploaded_by: str,
        index_immediately: bool = True,
    ) -> KnowledgeDocumentRecord:
        doc_id = f"doc-{uuid4()}"
        now = datetime.now(timezone.utc)
        record = KnowledgeDocumentRecord(
            id=doc_id,
            name=title,
            type=source_type,
            source_type=source_type,
            indexed=False,
            version="v1",
            status="pending_index",
            last_indexed_at=None,
            file_name=file_name,
            mime_type=mime_type,
            size_bytes=size_bytes,
            created_by=uploaded_by,
        )
        self._documents[doc_id] = record
        self._audit_events[doc_id] = [
            AuditEvent(
                action="uploaded",
                actor=uploaded_by,
                timestamp=now,
                notes=f"{file_name} ({mime_type}, {size_bytes} bytes) uploaded",
            )
        ]

        if index_immediately:
            self.mark_indexed(doc_id, actor="system/kb-indexer", notes="Document indexed after upload")

        return record

    def mark_indexed(self, doc_id: str, *, actor: str, notes: Optional[str] = None) -> KnowledgeDocumentRecord:
        record = self.get_document(doc_id)
        record.indexed = True
        record.status = "indexed"
        record.last_indexed_at = datetime.now(timezone.utc)
        self._audit_events.setdefault(doc_id, []).append(
            AuditEvent(action="indexed", actor=actor, timestamp=record.last_indexed_at, notes=notes)
        )
        return record

    def delete_document(self, doc_id: str, *, actor: str) -> KnowledgeDocumentRecord:
        record = self.get_document(doc_id)
        self._audit_events.setdefault(doc_id, []).append(
            AuditEvent(action="deleted", actor=actor, timestamp=datetime.now(timezone.utc), notes="Document deleted")
        )
        del self._documents[doc_id]
        return record

    def reindex_document(self, doc_id: str, *, actor: str) -> KnowledgeDocumentRecord:
        record = self.get_document(doc_id)
        record.indexed = False
        record.status = "reindexing"
        self._audit_events.setdefault(doc_id, []).append(
            AuditEvent(
                action="reindex_queued",
                actor=actor,
                timestamp=datetime.now(timezone.utc),
                notes="Reindex requested via batch operation",
            )
        )
        return self.mark_indexed(doc_id, actor="system/kb-indexer", notes="Reindex completed")

    def get_audit_events(self, doc_id: str) -> List[Dict[str, str]]:
        if doc_id not in self._audit_events:
            raise KeyError(doc_id)
        return [event.to_dict() for event in self._audit_events[doc_id]]


kb_store = KnowledgeBaseStore()
