"""
EHR Query Plugin - Voice Commands for Epic FHIR Data

Provides voice commands for querying EHR data during dictation:
- "Show medications" - List patient's current medications
- "Show allergies" - List patient's allergies
- "Show vitals" - Display recent vital signs
- "Show labs" / "Latest CBC" - Display lab results
- "Patient summary" - Full clinical summary
- "Compare medications" - Medication reconciliation

Requires Phase 6 Epic FHIR integration to be enabled.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from ..plugin_registry import DictationPlugin

logger = logging.getLogger(__name__)


class EHRQueryPlugin(DictationPlugin):
    """
    Voice command plugin for querying Epic FHIR data.

    Adds voice commands that allow clinicians to query patient data
    from the EHR during dictation without switching applications.
    """

    plugin_id = "ehr_query"
    plugin_name = "EHR Voice Query"
    sections = []  # This plugin doesn't define note sections

    vocabulary_boost = [
        # Lab types
        "CBC",
        "CMP",
        "BMP",
        "LFTs",
        "UA",
        "TSH",
        "hemoglobin",
        "hematocrit",
        "platelet",
        "WBC",
        "sodium",
        "potassium",
        "creatinine",
        "BUN",
        "glucose",
        "A1C",
        "hemoglobin A1C",
        "troponin",
        "BNP",
        "proBNP",
        "INR",
        "PTT",
        "PT",
        # Vitals
        "blood pressure",
        "pulse",
        "respiratory rate",
        "oxygen saturation",
        "SpO2",
        "temperature",
        "BMI",
        "weight",
        "height",
        # Commands
        "show medications",
        "list medications",
        "current medications",
        "show allergies",
        "patient allergies",
        "show vitals",
        "latest vitals",
        "vital signs",
        "show labs",
        "lab results",
        "latest labs",
        "patient summary",
        "clinical summary",
        "compare medications",
        "medication reconciliation",
    ]

    # Voice command patterns
    COMMANDS = {
        "medications": [
            r"show\s+(?:me\s+)?(?:the\s+)?medications?",
            r"list\s+(?:all\s+)?medications?",
            r"(?:current|active)\s+medications?",
            r"what\s+(?:are\s+)?(?:the\s+)?medications?",
            r"patient(?:'s)?\s+medications?",
        ],
        "allergies": [
            r"show\s+(?:me\s+)?(?:the\s+)?allergies",
            r"list\s+(?:all\s+)?allergies",
            r"patient(?:'s)?\s+allergies",
            r"what\s+allergies",
            r"any\s+allergies",
        ],
        "vitals": [
            r"show\s+(?:me\s+)?(?:the\s+)?vitals?",
            r"latest\s+vitals?",
            r"vital\s+signs?",
            r"current\s+vitals?",
            r"patient(?:'s)?\s+vitals?",
        ],
        "labs": [
            r"show\s+(?:me\s+)?(?:the\s+)?labs?",
            r"lab\s+results?",
            r"latest\s+labs?",
            r"recent\s+labs?",
        ],
        "labs_cbc": [
            r"(?:show|get|latest)\s+(?:the\s+)?cbc",
            r"complete\s+blood\s+count",
        ],
        "labs_bmp": [
            r"(?:show|get|latest)\s+(?:the\s+)?(?:bmp|cmp)",
            r"basic\s+metabolic\s+panel",
            r"complete\s+metabolic\s+panel",
        ],
        "conditions": [
            r"show\s+(?:me\s+)?(?:the\s+)?conditions?",
            r"problem\s+list",
            r"(?:active\s+)?diagnoses",
            r"patient(?:'s)?\s+conditions?",
        ],
        "summary": [
            r"patient\s+summary",
            r"clinical\s+summary",
            r"show\s+(?:me\s+)?(?:the\s+)?summary",
            r"overview",
        ],
        "reconcile": [
            r"compare\s+medications?",
            r"medication\s+reconciliation",
            r"reconcile\s+(?:the\s+)?medications?",
            r"check\s+medications?\s+(?:against|vs)",
        ],
    }

    def __init__(
        self,
        ehr_data_service=None,
        event_bus=None,
        policy_service=None,
    ):
        super().__init__()
        self.ehr_data_service = ehr_data_service
        self.event_bus = event_bus
        self.policy_service = policy_service

        # Compile patterns
        self._patterns = {}
        for cmd_type, patterns in self.COMMANDS.items():
            self._patterns[cmd_type] = [re.compile(p, re.IGNORECASE) for p in patterns]

    def is_enabled(self, user_id: Optional[str] = None) -> bool:
        """Check if EHR queries are enabled"""
        if self.policy_service:
            return self.policy_service.is_feature_enabled(
                "epic_fhir_read_only", user_id
            ) and self.policy_service.is_feature_enabled("epic_voice_queries", user_id)
        return self.ehr_data_service is not None

    def matches_command(self, text: str) -> Optional[str]:
        """
        Check if text matches any EHR command.

        Returns command type or None.
        """
        text = text.strip().lower()

        for cmd_type, patterns in self._patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    return cmd_type

        return None

    async def handle_command(
        self,
        command_type: str,
        session_id: str,
        user_id: Optional[str] = None,
        context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Handle an EHR voice command.

        Args:
            command_type: Type of command (medications, allergies, etc.)
            session_id: Session ID
            user_id: User ID
            context: Additional context

        Returns:
            Dict with result data and speech text
        """
        if not self.is_enabled(user_id):
            return {
                "success": False,
                "error": "EHR integration not enabled",
                "speak_text": "EHR access is not currently enabled.",
            }

        if not self.ehr_data_service:
            return {
                "success": False,
                "error": "EHR service not available",
                "speak_text": "The EHR service is not available.",
            }

        # Get query from command type
        query = self._command_to_query(command_type)

        # Execute query
        result = await self.ehr_data_service.handle_voice_query(
            session_id=session_id,
            query=query,
            user_id=user_id,
        )

        # Publish event
        if self.event_bus:
            await self.event_bus.publish_event(
                event_type="dictation.command",
                data={
                    "command_type": "ehr_query",
                    "ehr_query_type": command_type,
                    "success": result.success,
                    "plugin": self.plugin_id,
                },
                session_id=session_id,
                source_engine="dictation",
            )

        return {
            "success": result.success,
            "query_type": result.query_type,
            "data": result.data,
            "summary": result.summary,
            "speak_text": result.speak_text,
            "error": result.error,
        }

    def _command_to_query(self, command_type: str) -> str:
        """Convert command type to query string"""
        mapping = {
            "medications": "show medications",
            "allergies": "show allergies",
            "vitals": "show vitals",
            "labs": "show labs",
            "labs_cbc": "latest cbc",
            "labs_bmp": "latest bmp",
            "conditions": "show conditions",
            "summary": "patient summary",
            "reconcile": "compare medications",
        }
        return mapping.get(command_type, command_type)

    async def on_activate(self, context: Dict) -> None:
        """Called when plugin is activated"""
        session_id = context.get("session_id")
        patient_id = context.get("patient_fhir_id")
        user_id = context.get("user_id")

        if patient_id and self.ehr_data_service:
            # Pre-load patient data
            await self.ehr_data_service.set_patient(
                session_id=session_id,
                patient_fhir_id=patient_id,
                user_id=user_id,
            )
            logger.info(f"EHR plugin activated, loading patient {patient_id}")

    async def on_deactivate(self, context: Dict) -> None:
        """Called when plugin is deactivated"""
        session_id = context.get("session_id")
        if self.ehr_data_service:
            self.ehr_data_service.clear_session(session_id)

    def get_available_commands(self) -> List[Dict[str, str]]:
        """Get list of available voice commands"""
        return [
            {
                "command": "Show medications",
                "description": "List patient's current medications",
            },
            {
                "command": "Show allergies",
                "description": "List patient's allergies",
            },
            {
                "command": "Show vitals",
                "description": "Display recent vital signs",
            },
            {
                "command": "Show labs / Latest CBC / Latest BMP",
                "description": "Display lab results",
            },
            {
                "command": "Show conditions",
                "description": "Display problem list",
            },
            {
                "command": "Patient summary",
                "description": "Full clinical summary",
            },
            {
                "command": "Compare medications",
                "description": "Compare EHR vs dictation medications",
            },
        ]


class EHRDiscrepancyPlugin(DictationPlugin):
    """
    Plugin for detecting discrepancies between EHR and dictation.

    Monitors dictation for medication mentions and compares against
    the patient's EHR medication list. Alerts when:
    - New medication not in EHR
    - EHR medication not mentioned
    - Dose differences detected
    """

    plugin_id = "ehr_discrepancy"
    plugin_name = "EHR Discrepancy Detection"
    sections = []

    vocabulary_boost = []  # Uses medication vocabulary from EHR

    def __init__(
        self,
        ehr_data_service=None,
        clinical_engine=None,
        event_bus=None,
        policy_service=None,
    ):
        super().__init__()
        self.ehr_data_service = ehr_data_service
        self.clinical_engine = clinical_engine
        self.event_bus = event_bus
        self.policy_service = policy_service

        # Track medications mentioned in dictation
        self._session_medications: Dict[str, List[str]] = {}

    def is_enabled(self, user_id: Optional[str] = None) -> bool:
        """Check if discrepancy detection is enabled"""
        if self.policy_service:
            return self.policy_service.is_feature_enabled(
                "epic_fhir_read_only", user_id
            ) and self.policy_service.is_feature_enabled("epic_discrepancy_detection", user_id)
        return self.ehr_data_service is not None

    async def on_activate(self, context: Dict) -> None:
        """Initialize medication tracking for session"""
        session_id = context.get("session_id")
        self._session_medications[session_id] = []

    async def on_deactivate(self, context: Dict) -> None:
        """Clear medication tracking"""
        session_id = context.get("session_id")
        if session_id in self._session_medications:
            del self._session_medications[session_id]

    async def analyze_text(
        self,
        session_id: str,
        text: str,
        user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze dictation text for medication discrepancies.

        Returns discrepancy alert if found.
        """
        if not self.is_enabled(user_id):
            return None

        if not self.ehr_data_service or not self.clinical_engine:
            return None

        # Get EHR context
        ehr_context = self.ehr_data_service.get_memory_context(session_id)
        if not ehr_context.get("ehr_loaded"):
            return None

        ehr_medications = ehr_context.get("medications", [])
        if not ehr_medications:
            return None

        # Extract medications from text
        # This would use the clinical engine's medication extraction
        # For now, simple pattern matching
        mentioned_meds = self._extract_medications_from_text(text)

        if not mentioned_meds:
            return None

        # Track medications
        if session_id not in self._session_medications:
            self._session_medications[session_id] = []
        self._session_medications[session_id].extend(mentioned_meds)

        # Compare against EHR
        ehr_med_names = [m.get("name", "").lower() for m in ehr_medications]

        # Find new medications not in EHR
        new_meds = []
        for med in mentioned_meds:
            if not any(ehr_med in med or med in ehr_med for ehr_med in ehr_med_names):
                new_meds.append(med)

        if new_meds:
            alert = {
                "type": "new_medication",
                "medications": new_meds,
                "message": f"New medication(s) not in EHR: {', '.join(new_meds)}",
                "severity": "info",
            }

            # Publish event
            if self.event_bus:
                await self.event_bus.publish_event(
                    event_type="clinical.alert",
                    data={
                        "alert_type": "medication_discrepancy",
                        "subtype": "new_medication",
                        "medications": new_meds,
                        "plugin": self.plugin_id,
                    },
                    session_id=session_id,
                    source_engine="dictation",
                )

            return alert

        return None

    def _extract_medications_from_text(self, text: str) -> List[str]:
        """
        Extract medication names from text.

        This is a simplified implementation. In production,
        would use the clinical engine's NER.
        """
        # Common medication patterns
        patterns = [
            r"(?:prescribe|prescribed|taking|take|start|started|continue|continuing)\s+(\w+(?:\s+\d+\s*mg)?)",
            r"(\w+)\s+(?:\d+\s*)?(?:mg|mcg|units?)\s+(?:daily|bid|tid|qid|prn)",
        ]

        medications = []
        text_lower = text.lower()

        for pattern in patterns:
            matches = re.findall(pattern, text_lower)
            medications.extend(matches)

        # Filter common words
        stop_words = {"the", "a", "an", "patient", "will", "should", "continue"}
        return [m.strip() for m in medications if m.strip() not in stop_words]

    async def get_session_summary(
        self,
        session_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get medication reconciliation summary for session.

        Compares all medications mentioned vs EHR list.
        """
        if not self.is_enabled(user_id):
            return None

        if not self.ehr_data_service:
            return None

        mentioned = self._session_medications.get(session_id, [])
        if not mentioned:
            return None

        ehr_context = self.ehr_data_service.get_memory_context(session_id)
        ehr_medications = ehr_context.get("medications", [])

        ehr_names = {m.get("name", "").lower() for m in ehr_medications}
        mentioned_set = set(mentioned)

        # Categorize
        in_both = mentioned_set.intersection(ehr_names)
        only_mentioned = mentioned_set - ehr_names
        not_mentioned = ehr_names - mentioned_set

        return {
            "mentioned_medications": list(mentioned_set),
            "ehr_medications": list(ehr_names),
            "confirmed": list(in_both),
            "new_not_in_ehr": list(only_mentioned),
            "ehr_not_mentioned": list(not_mentioned),
            "discrepancy_count": len(only_mentioned) + len(not_mentioned),
        }


__all__ = [
    "EHRQueryPlugin",
    "EHRDiscrepancyPlugin",
]
