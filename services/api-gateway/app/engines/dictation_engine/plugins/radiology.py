"""
Radiology Report Plugin

Radiology report template with imaging-specific sections.
"""

from typing import Any, Dict, List, Optional

from .base import BaseDictationPlugin


class RadiologyPlugin(BaseDictationPlugin):
    """
    Radiology report dictation plugin.

    Sections:
    - clinical_indication: Reason for study
    - technique: Imaging protocol used
    - comparison: Prior studies for comparison
    - findings: Detailed observations
    - impression: Summary and recommendations
    """

    plugin_id = "radiology"
    plugin_name = "Radiology Report"
    sections = [
        "clinical_indication",
        "technique",
        "comparison",
        "findings",
        "impression",
    ]

    vocabulary_boost = [
        # Modality terms
        "CT scan",
        "MRI",
        "ultrasound",
        "X-ray",
        "fluoroscopy",
        "PET scan",
        "mammography",
        "angiography",
        "contrast enhanced",
        "non-contrast",
        "with and without contrast",
        "T1 weighted",
        "T2 weighted",
        "FLAIR",
        "diffusion weighted",
        "DWI",
        "ADC",
        "gadolinium",
        "iodinated contrast",
        # Anatomy
        "thorax",
        "abdomen",
        "pelvis",
        "extremity",
        "spine",
        "cervical",
        "thoracic",
        "lumbar",
        "sacral",
        "cranial",
        "intracranial",
        # Findings
        "opacity",
        "lucency",
        "consolidation",
        "atelectasis",
        "effusion",
        "nodule",
        "mass",
        "lesion",
        "enhancement",
        "calcification",
        "no acute abnormality",
        "unremarkable",
        "within normal limits",
        "stable",
        "unchanged",
        "interval change",
        "new finding",
        # Measurements
        "millimeters",
        "centimeters",
        "Hounsfield units",
        "signal intensity",
        # Common phrases
        "IMPRESSION",
        "FINDINGS",
        "TECHNIQUE",
        "COMPARISON",
        "CLINICAL HISTORY",
    ]

    def _build_voice_commands(self) -> Dict[str, Any]:
        """Build radiology-specific commands"""
        commands = super()._build_voice_commands()
        commands.update(
            {
                "normal_study": self._cmd_normal_study,
                "add_finding": self._cmd_add_finding,
                "critical_finding": self._cmd_critical_finding,
            }
        )
        return commands

    async def _cmd_normal_study(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Insert normal study template"""
        findings = note.sections.get("findings")
        impression = note.sections.get("impression")

        if findings:
            findings.content = "No acute cardiopulmonary abnormality."
        if impression:
            impression.content = "Normal study. No acute findings."

        return {"success": True, "action": "normal_study"}

    async def _cmd_add_finding(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Add a finding with location"""
        finding = args.get("finding", "") if args else ""
        location = args.get("location", "") if args else ""

        if not finding:
            return {"success": False, "error": "No finding specified"}

        findings = note.sections.get("findings")
        if findings:
            entry = f"- {location}: {finding}" if location else f"- {finding}"
            if findings.content:
                findings.content += f"\n{entry}"
            else:
                findings.content = entry
            return {"success": True, "action": "add_finding"}

        return {"success": False, "error": "Findings section not found"}

    async def _cmd_critical_finding(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Flag a critical finding for immediate communication"""
        finding = args.get("finding", "") if args else ""

        impression = note.sections.get("impression")
        if impression:
            critical_note = f"\n\n*** CRITICAL FINDING ***\n{finding}\nReferred for immediate attention."
            impression.content += critical_note
            return {
                "success": True,
                "action": "critical_finding",
                "requires_callback": True,
            }

        return {"success": False, "error": "Cannot add critical finding"}


__all__ = ["RadiologyPlugin"]
