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
    entities: List[Dict[str, Any]] = []  # [{type, text, start, end, path}]
    phi_types: List[str] = []  # e.g., ["name", "mrn", "date"]


class PHIDetector:
    """Stubbed PHI detector.

    In early phases this simply returns contains_phi=False so the
    system behaves as if no PHI is present. Later phases will replace
    this with a proper implementation.
    """

    async def detect_in_text(self, text: str) -> PHIResult:
        return PHIResult(contains_phi=False, entities=[])

    def _extract_strings(
        self, obj: Any, path: str = ""
    ) -> List[tuple[str, str]]:
        """Recursively extract all string values from nested dicts/lists.

        Args:
            obj: The object to extract strings from (dict, list, or primitive)
            path: Current path in the nested structure (e.g., "patient.name")

        Returns:
            List of (string_value, path) tuples
        """
        results: List[tuple[str, str]] = []

        if isinstance(obj, str):
            if obj.strip():  # Only include non-empty strings
                results.append((obj, path))
        elif isinstance(obj, dict):
            for key, value in obj.items():
                new_path = f"{path}.{key}" if path else key
                results.extend(self._extract_strings(value, new_path))
        elif isinstance(obj, (list, tuple)):
            for idx, item in enumerate(obj):
                new_path = f"{path}[{idx}]"
                results.extend(self._extract_strings(item, new_path))
        # Ignore other types (int, float, bool, None, etc.)

        return results

    async def detect_in_dict(self, payload: Dict[str, Any]) -> PHIResult:
        """Detect PHI in a nested dictionary structure.

        Walks through all nested dicts and lists, extracts string values,
        and checks each for PHI. Aggregates all findings into a single result.

        Args:
            payload: Dictionary that may contain nested structures with PHI

        Returns:
            PHIResult with aggregated findings from all string values
        """
        # Extract all string values with their paths
        string_values = self._extract_strings(payload)

        if not string_values:
            return PHIResult(contains_phi=False, entities=[])

        # Check each string for PHI
        all_entities: List[Dict[str, Any]] = []
        all_phi_types: set[str] = set()

        for text, path in string_values:
            result = await self.detect_in_text(text)
            if result.contains_phi:
                # Add path information to each entity
                for entity in result.entities:
                    entity_with_path = {**entity, "path": path}
                    all_entities.append(entity_with_path)
                all_phi_types.update(result.phi_types)

        return PHIResult(
            contains_phi=len(all_entities) > 0,
            entities=all_entities,
            phi_types=list(all_phi_types),
        )
