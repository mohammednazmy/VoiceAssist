"""
Medical Autocorrect - Medical Spell-Checking and Abbreviation Expansion

Provides context-aware medical autocorrection:
- Medication name correction
- Abbreviation expansion
- Homophone disambiguation
- Specialty-specific vocabulary

Phase 4 Enhancements:
- Extended medical vocabulary
- Specialty-specific corrections
- Context-aware autocorrect (section-based)
- Batch correction with confidence scores
- Learning from user corrections
"""

import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class CorrectionType(Enum):
    """Types of autocorrection"""

    SPELLING = "spelling"
    MEDICATION = "medication"
    ABBREVIATION = "abbreviation"
    HOMOPHONE = "homophone"
    SPECIALTY = "specialty"


@dataclass
class CorrectionResult:
    """Result of an autocorrection"""

    original: str
    corrected: str
    correction_type: CorrectionType
    confidence: float
    position: int
    context: Optional[str] = None


class MedicalAutocorrect:
    """
    Medical autocorrect service.

    Handles:
    - Common medical misspellings
    - Abbreviation expansion
    - Medication name normalization
    - Context-aware homophone resolution
    """

    # Common medical misspellings
    SPELLING_CORRECTIONS = {
        "neumonia": "pneumonia",
        "diabeties": "diabetes",
        "hypertention": "hypertension",
        "perscription": "prescription",
        "symtom": "symptom",
        "symtoms": "symptoms",
        "diagnoses": "diagnosis",  # When singular intended
        "abdoman": "abdomen",
        "inflamation": "inflammation",
        "rythm": "rhythm",
        "defibulator": "defibrillator",
        "anurysm": "aneurysm",
        "arrythmia": "arrhythmia",
        "diarreha": "diarrhea",
        "dispnea": "dyspnea",
        "hemorrhage": "hemorrhage",
        "hemmorage": "hemorrhage",
    }

    # Abbreviation expansions
    ABBREVIATIONS = {
        "htn": "hypertension",
        "dm": "diabetes mellitus",
        "dm2": "type 2 diabetes mellitus",
        "cad": "coronary artery disease",
        "copd": "chronic obstructive pulmonary disease",
        "chf": "congestive heart failure",
        "ckd": "chronic kidney disease",
        "uti": "urinary tract infection",
        "sob": "shortness of breath",
        "cp": "chest pain",
        "n/v": "nausea and vomiting",
        "ha": "headache",
        "r/o": "rule out",
        "w/o": "without",
        "c/o": "complains of",
        "s/p": "status post",
        "h/o": "history of",
        "prn": "as needed",
        "bid": "twice daily",
        "tid": "three times daily",
        "qid": "four times daily",
        "qhs": "at bedtime",
        "po": "by mouth",
        "iv": "intravenous",
        "im": "intramuscular",
        "sq": "subcutaneous",
    }

    # Homophones in medical context
    HOMOPHONES = {
        # (word, context_hint): correct_word
        ("ilium", "intestine"): "ileum",
        ("ilium", "bone"): "ilium",
        ("peroneal", "kidney"): "perineal",
        ("peroneal", "leg"): "peroneal",
        ("perfusion", "infection"): "profusion",  # rare case
    }

    # Medication name corrections (common mishearings)
    MEDICATION_CORRECTIONS = {
        # Common misspellings
        "metforeman": "metformin",
        "lisinipril": "lisinopril",
        "amlodapine": "amlodipine",
        "atorvistatin": "atorvastatin",
        "gabapenton": "gabapentin",
        "tramadal": "tramadol",
        "losarton": "losartan",
        "omeprozole": "omeprazole",
        "levothyroxin": "levothyroxine",
        "prednisown": "prednisone",
        "hidrocodone": "hydrocodone",
        "oxycodon": "oxycodone",
        # Extended list - Phase 4
        "furosimide": "furosemide",
        "clopidagrel": "clopidogrel",
        "metoprolal": "metoprolol",
        "warferen": "warfarin",
        "pantaprazole": "pantoprazole",
        "sertroline": "sertraline",
        "escitlopram": "escitalopram",
        "duloxatine": "duloxetine",
        "alprazalam": "alprazolam",
        "clonazapam": "clonazepam",
        "trazadone": "trazodone",
        "quetiapene": "quetiapine",
        "olanzapene": "olanzapine",
        "risperadone": "risperidone",
        "lamotrigene": "lamotrigine",
        "topiramate": "topiramate",  # Sometimes misheard
        "carbamazapine": "carbamazepine",
        "phenytoine": "phenytoin",
        "zolpadim": "zolpidem",
        "cyclobenzaprene": "cyclobenzaprine",
        "celecoxab": "celecoxib",
        "ibuprofen": "ibuprofen",  # Often dropped syllables
        "alendronate": "alendronate",
        "tamsulosine": "tamsulosin",
        "finesteride": "finasteride",
        "sildinafil": "sildenafil",
        "tadalafeel": "tadalafil",
        "monteleukast": "montelukast",
        "albuteeral": "albuterol",
        "fluticasown": "fluticasone",
        "tiotropeum": "tiotropium",
        "symbicord": "symbicort",
    }

    # Specialty-specific corrections - Phase 4
    SPECIALTY_CORRECTIONS = {
        "cardiology": {
            "myocardeal infarction": "myocardial infarction",
            "atreal fibrillation": "atrial fibrillation",
            "ejection fracture": "ejection fraction",
            "troponine": "troponin",
            "bnp": "BNP",
            "nt-probnp": "NT-proBNP",
        },
        "neurology": {
            "cerebral vascular accident": "cerebrovascular accident",
            "transiant ischemic attack": "transient ischemic attack",
            "parcinsons": "Parkinson's",
            "alzeimers": "Alzheimer's",
            "seziure": "seizure",
            "miagraine": "migraine",
        },
        "pulmonology": {
            "pulmanary": "pulmonary",
            "pneumonea": "pneumonia",
            "astma": "asthma",
            "brochiectasis": "bronchiectasis",
            "emphesema": "emphysema",
        },
        "orthopedics": {
            "osteoarthritus": "osteoarthritis",
            "rhumatoid arthritis": "rheumatoid arthritis",
            "meniscis": "meniscus",
            "rotater cuff": "rotator cuff",
            "lumbar stenoses": "lumbar stenosis",
        },
        "radiology": {
            "attelectasis": "atelectasis",
            "opasity": "opacity",
            "callcification": "calcification",
            "enfusion": "effusion",
            "consolidasion": "consolidation",
        },
    }

    def __init__(self, specialty: Optional[str] = None):
        self.specialty = specialty

        # Build combined correction map
        self._corrections = {}
        self._corrections.update(self.SPELLING_CORRECTIONS)
        self._corrections.update(self.MEDICATION_CORRECTIONS)

        # Add specialty corrections if specified
        if specialty and specialty in self.SPECIALTY_CORRECTIONS:
            self._corrections.update(self.SPECIALTY_CORRECTIONS[specialty])

        # User-learned corrections (Phase 4)
        self._user_corrections: Dict[str, str] = {}
        self._correction_counts: Dict[str, int] = {}

        logger.info(f"MedicalAutocorrect initialized (specialty: {specialty})")

    async def correct(
        self,
        text: str,
        note_type: Optional[str] = None,
        expand_abbreviations: bool = False,
    ) -> str:
        """
        Apply medical autocorrection to text.

        Args:
            text: Text to correct
            note_type: Optional note type for context
            expand_abbreviations: Whether to expand abbreviations

        Returns:
            Corrected text
        """
        result = text

        # Apply spelling corrections
        result = self._apply_spelling_corrections(result)

        # Apply medication corrections
        result = self._apply_medication_corrections(result)

        # Expand abbreviations if requested
        if expand_abbreviations:
            result = self._expand_abbreviations(result)

        return result

    def _apply_spelling_corrections(self, text: str) -> str:
        """Apply spelling corrections"""
        words = text.split()
        corrected = []

        for word in words:
            word_lower = word.lower().rstrip(".,;:!?")
            punctuation = word[len(word_lower) :] if len(word) > len(word_lower) else ""

            if word_lower in self._corrections:
                # Preserve original capitalization
                correction = self._corrections[word_lower]
                if word[0].isupper():
                    correction = correction.capitalize()
                corrected.append(correction + punctuation)
            else:
                corrected.append(word)

        return " ".join(corrected)

    def _apply_medication_corrections(self, text: str) -> str:
        """Apply medication-specific corrections"""
        result = text

        for wrong, correct in self.MEDICATION_CORRECTIONS.items():
            # Case-insensitive replacement
            pattern = re.compile(re.escape(wrong), re.IGNORECASE)
            result = pattern.sub(correct, result)

        return result

    def _expand_abbreviations(self, text: str) -> str:
        """Expand medical abbreviations"""
        words = text.split()
        expanded = []

        for word in words:
            word_lower = word.lower().rstrip(".,;:!?")
            punctuation = word[len(word_lower) :] if len(word) > len(word_lower) else ""

            if word_lower in self.ABBREVIATIONS:
                expansion = self.ABBREVIATIONS[word_lower]
                expanded.append(expansion + punctuation)
            else:
                expanded.append(word)

        return " ".join(expanded)

    def add_correction(self, wrong: str, correct: str) -> None:
        """Add a custom correction"""
        self._corrections[wrong.lower()] = correct.lower()

    def get_suggestions(
        self,
        word: str,
        max_suggestions: int = 5,
    ) -> List[Tuple[str, float]]:
        """
        Get spelling suggestions for a word.

        Returns list of (suggestion, confidence) tuples.
        """
        word_lower = word.lower()
        suggestions = []

        # Check direct corrections
        if word_lower in self._corrections:
            suggestions.append((self._corrections[word_lower], 1.0))

        # Simple edit distance suggestions (could use more sophisticated algorithm)
        for correct_word in self._corrections.values():
            if self._is_similar(word_lower, correct_word):
                suggestions.append((correct_word, 0.7))

        return suggestions[:max_suggestions]

    def _is_similar(self, word1: str, word2: str, threshold: int = 2) -> bool:
        """Check if words are similar using simple edit distance"""
        if abs(len(word1) - len(word2)) > threshold:
            return False

        # Simple character overlap check
        common = sum(1 for a, b in zip(word1, word2) if a == b)
        return common >= len(word1) - threshold

    # ===== Phase 4: Enhanced Methods =====

    async def correct_with_details(
        self,
        text: str,
        note_type: Optional[str] = None,
        section: Optional[str] = None,
    ) -> Tuple[str, List[CorrectionResult]]:
        """
        Apply corrections and return detailed results.

        Returns:
            Tuple of (corrected_text, list of correction details)
        """
        corrections = []
        words = text.split()
        corrected_words = []
        position = 0

        for word in words:
            word_lower = word.lower().rstrip(".,;:!?")
            punctuation = word[len(word_lower) :] if len(word) > len(word_lower) else ""

            # Check all correction sources
            correction = None
            correction_type = None
            confidence = 0.0

            # 1. User-learned corrections (highest priority)
            if word_lower in self._user_corrections:
                correction = self._user_corrections[word_lower]
                correction_type = CorrectionType.SPECIALTY
                confidence = 0.95

            # 2. Specialty corrections
            elif self.specialty and self.specialty in self.SPECIALTY_CORRECTIONS:
                specialty_map = self.SPECIALTY_CORRECTIONS[self.specialty]
                if word_lower in specialty_map:
                    correction = specialty_map[word_lower]
                    correction_type = CorrectionType.SPECIALTY
                    confidence = 0.9

            # 3. Medication corrections
            elif word_lower in self.MEDICATION_CORRECTIONS:
                correction = self.MEDICATION_CORRECTIONS[word_lower]
                correction_type = CorrectionType.MEDICATION
                confidence = 0.9

            # 4. Spelling corrections
            elif word_lower in self.SPELLING_CORRECTIONS:
                correction = self.SPELLING_CORRECTIONS[word_lower]
                correction_type = CorrectionType.SPELLING
                confidence = 0.85

            # 5. General corrections
            elif word_lower in self._corrections:
                correction = self._corrections[word_lower]
                correction_type = CorrectionType.SPELLING
                confidence = 0.8

            if correction:
                # Preserve capitalization
                if word[0].isupper():
                    correction = correction.capitalize()

                corrections.append(
                    CorrectionResult(
                        original=word,
                        corrected=correction + punctuation,
                        correction_type=correction_type,
                        confidence=confidence,
                        position=position,
                        context=section,
                    )
                )
                corrected_words.append(correction + punctuation)

                # Track correction usage
                self._correction_counts[word_lower] = self._correction_counts.get(word_lower, 0) + 1
            else:
                corrected_words.append(word)

            position += len(word) + 1  # +1 for space

        return " ".join(corrected_words), corrections

    def set_specialty(self, specialty: str) -> None:
        """Change specialty and reload specialty corrections"""
        self.specialty = specialty
        if specialty in self.SPECIALTY_CORRECTIONS:
            for wrong, correct in self.SPECIALTY_CORRECTIONS[specialty].items():
                self._corrections[wrong.lower()] = correct
        logger.info(f"Specialty set to: {specialty}")

    def learn_correction(self, wrong: str, correct: str) -> None:
        """
        Learn a new correction from user feedback.

        These corrections take highest priority.
        """
        self._user_corrections[wrong.lower()] = correct
        logger.debug(f"Learned correction: {wrong} -> {correct}")

    def unlearn_correction(self, wrong: str) -> bool:
        """Remove a learned correction"""
        if wrong.lower() in self._user_corrections:
            del self._user_corrections[wrong.lower()]
            return True
        return False

    def get_correction_stats(self) -> Dict[str, Any]:
        """Get statistics about corrections applied"""
        return {
            "specialty": self.specialty,
            "total_corrections": len(self._corrections),
            "user_corrections": len(self._user_corrections),
            "top_corrections": sorted(self._correction_counts.items(), key=lambda x: -x[1])[:10],
            "specialty_corrections": (len(self.SPECIALTY_CORRECTIONS.get(self.specialty, {})) if self.specialty else 0),
        }

    def apply_specialty_corrections(self, text: str, specialty: str) -> str:
        """Apply specialty-specific corrections without changing global specialty"""
        if specialty not in self.SPECIALTY_CORRECTIONS:
            return text

        result = text
        for wrong, correct in self.SPECIALTY_CORRECTIONS[specialty].items():
            pattern = re.compile(re.escape(wrong), re.IGNORECASE)
            result = pattern.sub(correct, result)

        return result

    def get_available_specialties(self) -> List[str]:
        """Get list of available specialties"""
        return list(self.SPECIALTY_CORRECTIONS.keys())


__all__ = [
    "MedicalAutocorrect",
    "CorrectionType",
    "CorrectionResult",
]
