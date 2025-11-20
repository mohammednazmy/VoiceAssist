"""PHI detection service stub.

The real implementation should follow SECURITY_COMPLIANCE.md and
ORCHESTRATION_DESIGN.md, using a library such as Presidio or a
custom NER model to detect PHI in text and tool arguments.
"""
from __future__ import annotations

from typing import Any, Dict, List
from pydantic import BaseModel


class PHIResult(BaseModel):
    contains_phi: bool
    entities: List[Dict[str, Any]] = []  # [{type, text, start, end}]
    phi_types: List[str] = []  # e.g., ["name", "mrn", "date"]


class PHIDetector:
    """Stubbed PHI detector.

    In early phases this simply returns contains_phi=False so the
    system behaves as if no PHI is present. Later phases will replace
    this with a proper implementation.
    """

    async def detect_in_text(self, text: str) -> PHIResult:
        return PHIResult(contains_phi=False, entities=[])

    async def detect_in_dict(self, payload: Dict[str, Any]) -> PHIResult:
        # TODO: walk nested dicts and check values
        return PHIResult(contains_phi=False, entities=[])
