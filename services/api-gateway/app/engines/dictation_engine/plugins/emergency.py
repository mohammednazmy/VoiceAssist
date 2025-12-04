"""
Emergency Department Plugin

Emergency department encounter note template.
"""

from typing import Any, Dict, Optional

from .base import BaseDictationPlugin


class EmergencyPlugin(BaseDictationPlugin):
    """
    Emergency department note dictation plugin.

    Sections:
    - triage: ESI level and chief complaint
    - chief_complaint: Primary presenting problem
    - hpi: History of present illness
    - physical_exam: Physical examination findings
    - mdm: Medical decision making
    - disposition: Discharge/admit decision
    """

    plugin_id = "emergency"
    plugin_name = "ED Encounter"
    sections = [
        "triage",
        "chief_complaint",
        "hpi",
        "physical_exam",
        "mdm",
        "disposition",
    ]

    vocabulary_boost = [
        # Triage terms
        "ESI level",
        "triage",
        "acuity",
        "emergent",
        "urgent",
        "non-urgent",
        # Chief complaints
        "chest pain",
        "shortness of breath",
        "abdominal pain",
        "headache",
        "syncope",
        "altered mental status",
        "trauma",
        "laceration",
        "motor vehicle accident",
        "MVA",
        "fall",
        "assault",
        # ED-specific
        "ED course",
        "interventions",
        "response to treatment",
        "serial exams",
        "observation",
        "reassessment",
        # Disposition
        "discharge",
        "admit",
        "transfer",
        "AMA",
        "against medical advice",
        "observation status",
        "inpatient",
        "ICU",
        "telemetry",
        "floor",
        # Common procedures
        "IV access",
        "central line",
        "intubation",
        "chest tube",
        "laceration repair",
        "splinting",
        "reduction",
        # Time-critical
        "door to needle",
        "door to balloon",
        "stroke alert",
        "trauma alert",
        "code",
        "STEMI",
        "sepsis",
        "stroke",
    ]

    def _build_voice_commands(self) -> Dict[str, Any]:
        """Build ED-specific commands"""
        commands = super()._build_voice_commands()
        commands.update(
            {
                "set_esi": self._cmd_set_esi,
                "admit_patient": self._cmd_admit,
                "discharge_patient": self._cmd_discharge,
                "order_workup": self._cmd_order_workup,
            }
        )
        return commands

    async def _cmd_set_esi(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Set ESI triage level"""
        level = args.get("level", 3) if args else 3

        triage = note.sections.get("triage")
        if triage:
            triage.content = f"ESI Level {level}"
            return {"success": True, "action": "set_esi", "level": level}

        return {"success": False, "error": "Triage section not found"}

    async def _cmd_admit(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Set disposition to admit"""
        service = args.get("service", "Medicine") if args else "Medicine"
        level = args.get("level", "floor") if args else "floor"

        disposition = note.sections.get("disposition")
        if disposition:
            disposition.content = f"Admit to {service}, {level} status."
            return {
                "success": True,
                "action": "admit",
                "service": service,
                "level": level,
            }

        return {"success": False, "error": "Disposition section not found"}

    async def _cmd_discharge(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Set disposition to discharge"""
        followup = args.get("followup", "") if args else ""

        disposition = note.sections.get("disposition")
        if disposition:
            content = "Discharge home."
            if followup:
                content += f" Follow up with {followup}."
            disposition.content = content
            return {"success": True, "action": "discharge", "followup": followup}

        return {"success": False, "error": "Disposition section not found"}

    async def _cmd_order_workup(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Add standard workup orders to MDM"""
        workup_type = args.get("type", "cardiac") if args else "cardiac"

        workups = {
            "cardiac": "CBC, BMP, troponin x3, ECG, CXR",
            "abd_pain": "CBC, CMP, lipase, UA, CT abdomen/pelvis with contrast",
            "sepsis": "CBC, CMP, lactate, blood cultures x2, UA, CXR, procalcitonin",
            "stroke": "CT head, CTA head/neck, CBC, BMP, PT/INR, glucose",
            "chest_pain": "CBC, BMP, troponin, D-dimer, ECG, CXR",
        }

        mdm = note.sections.get("mdm")
        if mdm:
            orders = workups.get(workup_type, workups["cardiac"])
            if mdm.content:
                mdm.content += f"\n\nWorkup ordered: {orders}"
            else:
                mdm.content = f"Workup ordered: {orders}"
            return {"success": True, "action": "order_workup", "orders": orders}

        return {"success": False, "error": "MDM section not found"}


__all__ = ["EmergencyPlugin"]
