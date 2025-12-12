#!/usr/bin/env python3
"""
One-off maintenance script: propagate phi_risk into Qdrant payloads.

This script scans the documents table for records that have a phi_risk value
stored in doc_metadata and calls KBIndexer.update_document_phi_risk for each
matching document. This ensures that older admin-processed documents gain
phi_risk and chunk_phi_risk fields in Qdrant payloads without requiring a
full reindex.

Usage (from repo root):
    cd services/api-gateway
    python tools/update_phi_risk_payloads.py

The script is idempotent and safe to run multiple times. It logs basic
progress information and skips documents that do not have a phi_risk value.
"""

from __future__ import annotations

import argparse
import logging
from typing import Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.document import Document
from app.services.kb_indexer import KBIndexer

logger = logging.getLogger(__name__)


def get_logger() -> logging.Logger:
    """Configure a basic stdout logger for CLI use."""
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter("[%(levelname)s] %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger


def update_all_documents_phi_risk(limit: Optional[int] = None) -> None:
    """
    Iterate over documents with phi_risk in doc_metadata and update Qdrant payloads.

    Args:
        limit: Optional maximum number of documents to process (for dry runs / testing).
    """
    log = get_logger()
    db = SessionLocal()

    try:
        kb_indexer = KBIndexer(qdrant_url=settings.QDRANT_URL)
        if not kb_indexer.qdrant_enabled or kb_indexer.qdrant_client is None:
            log.warning("Qdrant is disabled or unavailable - nothing to update")
            return

        query = db.query(Document).filter(Document.doc_metadata.isnot(None))

        processed = 0
        updated = 0
        skipped = 0

        for document in query.yield_per(100):
            if limit is not None and processed >= limit:
                break

            processed += 1
            metadata = document.doc_metadata or {}
            phi_risk = metadata.get("phi_risk")

            if not phi_risk:
                skipped += 1
                continue

            doc_id = document.document_id
            log.info("Updating phi_risk payload for document %s -> %s", doc_id, phi_risk)
            ok = kb_indexer.update_document_phi_risk(doc_id, str(phi_risk))
            if ok:
                updated += 1
            else:
                log.warning("Failed to update phi_risk payload for document %s", doc_id)

        log.info(
            "Completed phi_risk payload update: processed=%s, updated=%s, skipped=%s",
            processed,
            updated,
            skipped,
        )

    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Propagate phi_risk into Qdrant payloads for existing documents.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of documents to process (for dry runs / testing).",
    )
    args = parser.parse_args()

    update_all_documents_phi_risk(limit=args.limit)


if __name__ == "__main__":
    main()
