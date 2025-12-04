"""
SOAP Note Plugin

Standard SOAP (Subjective, Objective, Assessment, Plan) note template.

Phase 4 Enhancements:
- Section validation constraints
- Required field checking
- Custom validation for clinical completeness
"""

from typing import Any, Dict, List, Optional

from .base import BaseDictationPlugin, SectionConstraint, ValidationResult, ValidationSeverity


class SOAPPlugin(BaseDictationPlugin):
    """
    SOAP note dictation plugin.

    Sections:
    - Subjective: Patient's reported symptoms and history
    - Objective: Physical exam and test results
    - Assessment: Diagnosis and clinical reasoning
    - Plan: Treatment plan and follow-up

    Phase 4: Validation constraints for clinical completeness.
    """

    plugin_id = "soap"
    plugin_name = "SOAP Note"
    sections = ["subjective", "objective", "assessment", "plan"]

    # Phase 4: Section validation constraints
    section_constraints = {
        "subjective": SectionConstraint(
            required=True,
            min_length=50,  # Minimum 50 characters
            required_keywords={"chief complaint", "history"},
        ),
        "objective": SectionConstraint(
            required=True,
            min_length=30,
            required_keywords={"vital", "exam"},
        ),
        "assessment": SectionConstraint(
            required=True,
            min_length=20,
        ),
        "plan": SectionConstraint(
            required=True,
            min_length=20,
        ),
    }

    vocabulary_boost = [
        # Common medical terms
        "chief complaint",
        "history of present illness",
        "review of systems",
        "past medical history",
        "medications",
        "allergies",
        "social history",
        "family history",
        "vital signs",
        "physical examination",
        "differential diagnosis",
        "impression",
        "recommendations",
        # Physical exam terms
        "afebrile",
        "normocephalic",
        "atraumatic",
        "pupils equal round reactive",
        "PERRLA",
        "no lymphadenopathy",
        "clear to auscultation",
        "CTA",
        "regular rate and rhythm",
        "RRR",
        "soft non-tender",
        "no guarding",
        "no rebound",
        "extremities",
        "edema",
        "pulses",
        # Common abbreviations
        "HPI",
        "ROS",
        "PMH",
        "PSH",
        "FH",
        "SH",
        "PE",
        "A/P",
    ]

    def _build_voice_commands(self) -> Dict[str, Any]:
        """Build SOAP-specific commands"""
        commands = super()._build_voice_commands()
        commands.update(
            {
                "go_to_subjective": self._cmd_go_to_section("subjective"),
                "go_to_objective": self._cmd_go_to_section("objective"),
                "go_to_assessment": self._cmd_go_to_section("assessment"),
                "go_to_plan": self._cmd_go_to_section("plan"),
                "add_diagnosis": self._cmd_add_diagnosis,
                "add_medication": self._cmd_add_medication,
            }
        )
        return commands

    def _cmd_go_to_section(self, section: str):
        """Create a go-to-section command handler"""

        async def handler(note, args):
            if section in note.sections:
                return {"success": True, "action": "navigate", "section": section}
            return {"success": False, "error": f"Section {section} not found"}

        return handler

    async def _cmd_add_diagnosis(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Add a diagnosis to assessment section"""
        diagnosis = args.get("diagnosis", "") if args else ""
        if not diagnosis:
            return {"success": False, "error": "No diagnosis specified"}

        assessment = note.sections.get("assessment")
        if assessment:
            if assessment.content:
                assessment.content += f"\n- {diagnosis}"
            else:
                assessment.content = f"Diagnoses:\n- {diagnosis}"
            return {"success": True, "action": "add_diagnosis", "diagnosis": diagnosis}

        return {"success": False, "error": "Assessment section not found"}

    async def _cmd_add_medication(
        self,
        note: "DictationNote",
        args: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Add a medication to plan section"""
        medication = args.get("medication", "") if args else ""
        if not medication:
            return {"success": False, "error": "No medication specified"}

        plan = note.sections.get("plan")
        if plan:
            if "Medications:" in plan.content:
                plan.content += f"\n- {medication}"
            else:
                if plan.content:
                    plan.content += f"\n\nMedications:\n- {medication}"
                else:
                    plan.content = f"Medications:\n- {medication}"
            return {"success": True, "action": "add_medication", "medication": medication}

        return {"success": False, "error": "Plan section not found"}

    # ===== Phase 4: Custom Validation =====

    def _custom_validation(self, note: "DictationNote") -> ValidationResult:
        """SOAP-specific validation logic"""
        issues = []
        suggestions = []

        # Check for assessment-plan coherence
        assessment = note.sections.get("assessment")
        plan = note.sections.get("plan")

        if assessment and plan and assessment.content and plan.content:
            # Suggest follow-up if assessment mentions diagnosis but plan doesn't address it
            assessment_lower = assessment.content.lower()
            plan_lower = plan.content.lower()

            # Common conditions that should have plan entries
            condition_plan_pairs = [
                ("diabetes", ["medication", "glucose", "diet", "a1c"]),
                ("hypertension", ["medication", "blood pressure", "bp"]),
                ("infection", ["antibiotic", "culture", "follow-up"]),
            ]

            for condition, plan_keywords in condition_plan_pairs:
                if condition in assessment_lower:
                    if not any(kw in plan_lower for kw in plan_keywords):
                        issues.append(
                            {
                                "severity": ValidationSeverity.INFO.value,
                                "section": "plan",
                                "message": f"Assessment mentions '{condition}' but plan may be incomplete",
                            }
                        )
                        suggestions.append(f"Consider adding {condition} management to plan")

        # Check for allergies documentation
        subjective = note.sections.get("subjective")
        if subjective and subjective.content:
            if "allerg" not in subjective.content.lower():
                issues.append(
                    {
                        "severity": ValidationSeverity.INFO.value,
                        "section": "subjective",
                        "message": "Allergies not documented",
                    }
                )
                suggestions.append("Document allergy status (NKDA or list allergies)")

        return ValidationResult(
            is_valid=True,  # These are suggestions, not errors
            issues=issues,
            suggestions=suggestions,
        )


__all__ = ["SOAPPlugin"]
