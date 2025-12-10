"""
Medical Vocabulary Service - Specialty-Specific Medical Terms

Phase 8: Medical vocabulary management for STT keyword boosting.

Features:
- Specialty-specific term sets (cardiology, oncology, etc.)
- User-customizable vocabulary
- Integration with Deepgram keyword boosting
- Medical abbreviation and terminology management
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)


# ==============================================================================
# Enums
# ==============================================================================


class MedicalSpecialty(str, Enum):
    """Medical specialties with specific vocabulary."""

    GENERAL = "general"
    CARDIOLOGY = "cardiology"
    ONCOLOGY = "oncology"
    NEUROLOGY = "neurology"
    PULMONOLOGY = "pulmonology"
    GASTROENTEROLOGY = "gastroenterology"
    NEPHROLOGY = "nephrology"
    ENDOCRINOLOGY = "endocrinology"
    RHEUMATOLOGY = "rheumatology"
    INFECTIOUS_DISEASE = "infectious_disease"
    PSYCHIATRY = "psychiatry"
    PEDIATRICS = "pediatrics"
    OBSTETRICS = "obstetrics"
    ORTHOPEDICS = "orthopedics"
    DERMATOLOGY = "dermatology"
    OPHTHALMOLOGY = "ophthalmology"
    ENT = "ent"
    UROLOGY = "urology"
    HEMATOLOGY = "hematology"
    EMERGENCY = "emergency"
    PRIMARY_CARE = "primary_care"


# ==============================================================================
# Data Classes
# ==============================================================================


@dataclass
class MedicalTerm:
    """A medical term with metadata."""

    term: str
    category: str  # diagnosis, medication, procedure, anatomy, etc.
    specialty: MedicalSpecialty
    boost_weight: float = 1.0  # Weight for STT boosting (0.5-2.0)
    pronunciation_hints: List[str] = field(default_factory=list)


@dataclass
class VocabularySet:
    """A set of medical vocabulary for a specialty."""

    specialty: MedicalSpecialty
    terms: List[MedicalTerm]
    medications: List[str]
    diagnoses: List[str]
    procedures: List[str]
    anatomy: List[str]


@dataclass
class UserVocabulary:
    """User-customized vocabulary additions."""

    user_id: str
    custom_terms: List[str]
    custom_medications: List[str]
    preferred_abbreviations: Dict[str, str]
    specialty_weights: Dict[MedicalSpecialty, float]


# ==============================================================================
# Specialty Vocabulary
# ==============================================================================


# Base medical vocabulary (common across specialties)
BASE_VOCABULARY = {
    "medications": [
        "acetaminophen",
        "ibuprofen",
        "aspirin",
        "metformin",
        "lisinopril",
        "amlodipine",
        "atorvastatin",
        "metoprolol",
        "omeprazole",
        "gabapentin",
        "hydrochlorothiazide",
        "losartan",
        "levothyroxine",
        "prednisone",
        "amoxicillin",
        "azithromycin",
        "ciprofloxacin",
        "doxycycline",
        "furosemide",
        "pantoprazole",
        "sertraline",
        "escitalopram",
        "alprazolam",
        "lorazepam",
        "tramadol",
        "oxycodone",
        "hydrocodone",
    ],
    "diagnoses": [
        "hypertension",
        "diabetes mellitus",
        "hyperlipidemia",
        "obesity",
        "anxiety",
        "depression",
        "insomnia",
        "gastroesophageal reflux",
        "osteoarthritis",
        "chronic kidney disease",
        "coronary artery disease",
        "atrial fibrillation",
        "heart failure",
        "pneumonia",
        "bronchitis",
        "urinary tract infection",
        "cellulitis",
        "hypothyroidism",
    ],
    "procedures": [
        "electrocardiogram",
        "echocardiogram",
        "colonoscopy",
        "endoscopy",
        "CT scan",
        "MRI",
        "X-ray",
        "ultrasound",
        "biopsy",
        "lumbar puncture",
        "thoracentesis",
        "paracentesis",
        "intubation",
        "catheterization",
    ],
    "anatomy": [
        "abdomen",
        "chest",
        "extremities",
        "cardiovascular",
        "pulmonary",
        "neurological",
        "musculoskeletal",
        "gastrointestinal",
        "genitourinary",
        "head",
        "neck",
        "thorax",
        "pelvis",
        "spine",
    ],
}

# Specialty-specific vocabulary
SPECIALTY_VOCABULARY = {
    MedicalSpecialty.CARDIOLOGY: {
        "medications": [
            "nitroglycerin",
            "clopidogrel",
            "warfarin",
            "apixaban",
            "rivaroxaban",
            "digoxin",
            "amiodarone",
            "diltiazem",
            "verapamil",
            "carvedilol",
            "bisoprolol",
            "spironolactone",
            "eplerenone",
            "hydralazine",
            "isosorbide mononitrate",
            "isosorbide dinitrate",
            "prasugrel",
            "ticagrelor",
            "enoxaparin",
            "heparin",
        ],
        "diagnoses": [
            "myocardial infarction",
            "unstable angina",
            "stable angina",
            "heart failure",
            "cardiomyopathy",
            "pericarditis",
            "endocarditis",
            "aortic stenosis",
            "mitral regurgitation",
            "atrial fibrillation",
            "atrial flutter",
            "ventricular tachycardia",
            "ventricular fibrillation",
            "bradycardia",
            "tachycardia",
            "heart block",
            "sick sinus syndrome",
            "pulmonary hypertension",
            "aortic aneurysm",
            "peripheral vascular disease",
        ],
        "procedures": [
            "cardiac catheterization",
            "angioplasty",
            "stent placement",
            "pacemaker insertion",
            "defibrillator implantation",
            "ablation",
            "cardioversion",
            "transesophageal echocardiogram",
            "stress test",
            "nuclear stress test",
            "coronary artery bypass",
        ],
        "terms": [
            "ejection fraction",
            "troponin",
            "BNP",
            "pro-BNP",
            "left ventricle",
            "right ventricle",
            "left atrium",
            "right atrium",
            "aorta",
            "pulmonary artery",
            "inferior vena cava",
            "superior vena cava",
            "interventricular septum",
            "mitral valve",
            "aortic valve",
            "tricuspid valve",
            "pulmonic valve",
            "systolic",
            "diastolic",
        ],
    },
    MedicalSpecialty.ONCOLOGY: {
        "medications": [
            "cyclophosphamide",
            "doxorubicin",
            "cisplatin",
            "carboplatin",
            "paclitaxel",
            "docetaxel",
            "gemcitabine",
            "irinotecan",
            "oxaliplatin",
            "5-fluorouracil",
            "capecitabine",
            "methotrexate",
            "vincristine",
            "rituximab",
            "trastuzumab",
            "bevacizumab",
            "pembrolizumab",
            "nivolumab",
            "ipilimumab",
            "tamoxifen",
            "letrozole",
            "anastrozole",
        ],
        "diagnoses": [
            "adenocarcinoma",
            "squamous cell carcinoma",
            "lymphoma",
            "leukemia",
            "melanoma",
            "sarcoma",
            "glioblastoma",
            "meningioma",
            "myeloma",
            "breast cancer",
            "lung cancer",
            "colon cancer",
            "prostate cancer",
            "pancreatic cancer",
            "ovarian cancer",
            "cervical cancer",
            "hepatocellular carcinoma",
            "renal cell carcinoma",
            "bladder cancer",
        ],
        "procedures": [
            "chemotherapy",
            "radiation therapy",
            "immunotherapy",
            "bone marrow biopsy",
            "PET scan",
            "tumor resection",
            "lymph node dissection",
            "port placement",
            "central line insertion",
            "stem cell transplant",
        ],
        "terms": [
            "metastasis",
            "staging",
            "tumor marker",
            "CA-125",
            "PSA",
            "CEA",
            "AFP",
            "remission",
            "progression",
            "ECOG status",
            "Karnofsky score",
            "neutropenia",
            "thrombocytopenia",
            "anemia",
            "mucositis",
        ],
    },
    MedicalSpecialty.NEUROLOGY: {
        "medications": [
            "levodopa",
            "carbidopa",
            "pramipexole",
            "ropinirole",
            "amantadine",
            "donepezil",
            "memantine",
            "rivastigmine",
            "levetiracetam",
            "valproic acid",
            "carbamazepine",
            "phenytoin",
            "lamotrigine",
            "topiramate",
            "lacosamide",
            "sumatriptan",
            "rizatriptan",
            "botulinum toxin",
            "baclofen",
            "tizanidine",
        ],
        "diagnoses": [
            "Parkinson's disease",
            "Alzheimer's disease",
            "dementia",
            "epilepsy",
            "multiple sclerosis",
            "amyotrophic lateral sclerosis",
            "myasthenia gravis",
            "Guillain-Barre syndrome",
            "peripheral neuropathy",
            "stroke",
            "transient ischemic attack",
            "migraine",
            "tension headache",
            "cluster headache",
            "trigeminal neuralgia",
            "Bell's palsy",
            "essential tremor",
            "dystonia",
        ],
        "procedures": [
            "lumbar puncture",
            "EEG",
            "EMG",
            "nerve conduction study",
            "brain MRI",
            "carotid ultrasound",
            "transcranial Doppler",
            "deep brain stimulation",
            "thrombolysis",
            "thrombectomy",
        ],
        "terms": [
            "cranial nerves",
            "motor function",
            "sensory function",
            "reflexes",
            "gait",
            "coordination",
            "Babinski",
            "Romberg",
            "cerebrospinal fluid",
            "meninges",
            "cerebral cortex",
            "basal ganglia",
            "cerebellum",
            "brainstem",
        ],
    },
    MedicalSpecialty.PULMONOLOGY: {
        "medications": [
            "albuterol",
            "ipratropium",
            "tiotropium",
            "budesonide",
            "fluticasone",
            "montelukast",
            "theophylline",
            "roflumilast",
            "azithromycin",
            "prednisone",
            "methylprednisolone",
            "pirfenidone",
            "nintedanib",
        ],
        "diagnoses": [
            "asthma",
            "COPD",
            "emphysema",
            "chronic bronchitis",
            "pulmonary fibrosis",
            "pulmonary embolism",
            "pneumonia",
            "tuberculosis",
            "lung cancer",
            "pleural effusion",
            "pneumothorax",
            "pulmonary hypertension",
            "sleep apnea",
            "interstitial lung disease",
            "sarcoidosis",
            "bronchiectasis",
        ],
        "procedures": [
            "bronchoscopy",
            "thoracentesis",
            "chest tube placement",
            "pulmonary function test",
            "arterial blood gas",
            "CT chest",
            "ventilator management",
            "CPAP",
            "BiPAP",
        ],
        "terms": [
            "FEV1",
            "FVC",
            "peak flow",
            "oxygen saturation",
            "PaO2",
            "PaCO2",
            "respiratory rate",
            "tidal volume",
            "wheezing",
            "crackles",
            "rhonchi",
            "stridor",
            "dyspnea",
            "orthopnea",
            "paroxysmal nocturnal dyspnea",
        ],
    },
    MedicalSpecialty.GASTROENTEROLOGY: {
        "medications": [
            "omeprazole",
            "pantoprazole",
            "esomeprazole",
            "lansoprazole",
            "famotidine",
            "ranitidine",
            "sucralfate",
            "misoprostol",
            "mesalamine",
            "sulfasalazine",
            "azathioprine",
            "infliximab",
            "adalimumab",
            "vedolizumab",
            "lactulose",
            "rifaximin",
        ],
        "diagnoses": [
            "gastroesophageal reflux disease",
            "peptic ulcer disease",
            "gastritis",
            "Crohn's disease",
            "ulcerative colitis",
            "irritable bowel syndrome",
            "diverticulitis",
            "celiac disease",
            "hepatitis",
            "cirrhosis",
            "fatty liver disease",
            "pancreatitis",
            "cholecystitis",
            "cholelithiasis",
            "esophageal varices",
            "hepatocellular carcinoma",
            "colon cancer",
        ],
        "procedures": [
            "esophagogastroduodenoscopy",
            "colonoscopy",
            "ERCP",
            "liver biopsy",
            "paracentesis",
            "endoscopic ultrasound",
            "capsule endoscopy",
            "FibroScan",
            "TIPS procedure",
        ],
        "terms": [
            "bilirubin",
            "AST",
            "ALT",
            "alkaline phosphatase",
            "albumin",
            "ammonia",
            "INR",
            "ascites",
            "encephalopathy",
            "varices",
            "hepatomegaly",
            "splenomegaly",
            "steatosis",
            "fibrosis",
        ],
    },
}


# ==============================================================================
# Medical Vocabulary Service
# ==============================================================================


class MedicalVocabularyService:
    """
    Service for managing medical vocabulary for STT enhancement.

    Usage:
        service = MedicalVocabularyService()

        # Get vocabulary for a specialty
        vocab = service.get_vocabulary(MedicalSpecialty.CARDIOLOGY)

        # Get keywords for Deepgram boosting
        keywords = service.get_boost_keywords(
            specialty=MedicalSpecialty.CARDIOLOGY,
            user_id="user-123",
        )

        # Add user-specific terms
        service.add_user_term("user-123", "lisinopril-hydrochlorothiazide")
    """

    def __init__(self):
        self._base_vocabulary = BASE_VOCABULARY
        self._specialty_vocabulary = SPECIALTY_VOCABULARY
        self._user_vocabularies: Dict[str, UserVocabulary] = {}

    def get_vocabulary(self, specialty: MedicalSpecialty) -> VocabularySet:
        """
        Get the full vocabulary set for a specialty.

        Args:
            specialty: Medical specialty

        Returns:
            VocabularySet with all terms
        """
        # Start with base vocabulary
        medications = list(self._base_vocabulary["medications"])
        diagnoses = list(self._base_vocabulary["diagnoses"])
        procedures = list(self._base_vocabulary["procedures"])
        anatomy = list(self._base_vocabulary["anatomy"])

        # Add specialty-specific terms
        if specialty in self._specialty_vocabulary:
            spec_vocab = self._specialty_vocabulary[specialty]
            medications.extend(spec_vocab.get("medications", []))
            diagnoses.extend(spec_vocab.get("diagnoses", []))
            procedures.extend(spec_vocab.get("procedures", []))

        # Create term objects
        terms = []
        for med in medications:
            terms.append(
                MedicalTerm(
                    term=med,
                    category="medication",
                    specialty=specialty,
                    boost_weight=1.5,  # Boost medications highly
                )
            )
        for diag in diagnoses:
            terms.append(
                MedicalTerm(
                    term=diag,
                    category="diagnosis",
                    specialty=specialty,
                    boost_weight=1.3,
                )
            )

        return VocabularySet(
            specialty=specialty,
            terms=terms,
            medications=medications,
            diagnoses=diagnoses,
            procedures=procedures,
            anatomy=anatomy,
        )

    def get_boost_keywords(
        self,
        specialty: MedicalSpecialty = MedicalSpecialty.GENERAL,
        user_id: Optional[str] = None,
        max_keywords: int = 100,
    ) -> List[Dict[str, any]]:
        """
        Get keywords formatted for Deepgram keyword boosting.

        Args:
            specialty: Medical specialty
            user_id: Optional user ID for custom terms
            max_keywords: Maximum number of keywords (Deepgram limit is ~100)

        Returns:
            List of keyword dicts with term and boost weight
        """
        keywords = []

        # Get specialty vocabulary
        vocab = self.get_vocabulary(specialty)

        # Add medications with high boost
        for med in vocab.medications[:30]:
            keywords.append({"keyword": med, "boost": 1.5})

        # Add diagnoses
        for diag in vocab.diagnoses[:30]:
            keywords.append({"keyword": diag, "boost": 1.3})

        # Add procedures
        for proc in vocab.procedures[:20]:
            keywords.append({"keyword": proc, "boost": 1.2})

        # Add specialty-specific terms
        if specialty in self._specialty_vocabulary:
            spec_terms = self._specialty_vocabulary[specialty].get("terms", [])
            for term in spec_terms[:20]:
                keywords.append({"keyword": term, "boost": 1.4})

        # Add user-specific terms
        if user_id and user_id in self._user_vocabularies:
            user_vocab = self._user_vocabularies[user_id]
            for term in user_vocab.custom_terms:
                keywords.append({"keyword": term, "boost": 2.0})  # Highest boost for user terms
            for med in user_vocab.custom_medications:
                keywords.append({"keyword": med, "boost": 2.0})

        # Limit to max_keywords
        return keywords[:max_keywords]

    def add_user_term(
        self,
        user_id: str,
        term: str,
        category: str = "custom",
    ) -> None:
        """
        Add a custom term for a user.

        Args:
            user_id: User ID
            term: The term to add
            category: Term category (medication, diagnosis, custom)
        """
        if user_id not in self._user_vocabularies:
            self._user_vocabularies[user_id] = UserVocabulary(
                user_id=user_id,
                custom_terms=[],
                custom_medications=[],
                preferred_abbreviations={},
                specialty_weights={},
            )

        user_vocab = self._user_vocabularies[user_id]

        if category == "medication":
            if term not in user_vocab.custom_medications:
                user_vocab.custom_medications.append(term)
        else:
            if term not in user_vocab.custom_terms:
                user_vocab.custom_terms.append(term)

        logger.info(f"Added user term: user={user_id}, term={term}, category={category}")

    def add_user_abbreviation(
        self,
        user_id: str,
        abbreviation: str,
        expansion: str,
    ) -> None:
        """Add a user-specific abbreviation."""
        if user_id not in self._user_vocabularies:
            self._user_vocabularies[user_id] = UserVocabulary(
                user_id=user_id,
                custom_terms=[],
                custom_medications=[],
                preferred_abbreviations={},
                specialty_weights={},
            )

        self._user_vocabularies[user_id].preferred_abbreviations[abbreviation] = expansion
        logger.info(f"Added user abbreviation: user={user_id}, {abbreviation} -> {expansion}")

    def get_user_vocabulary(self, user_id: str) -> Optional[UserVocabulary]:
        """Get a user's custom vocabulary."""
        return self._user_vocabularies.get(user_id)

    def get_all_medications(
        self,
        specialty: Optional[MedicalSpecialty] = None,
    ) -> List[str]:
        """Get all medication names, optionally filtered by specialty."""
        medications = set(self._base_vocabulary["medications"])

        if specialty:
            if specialty in self._specialty_vocabulary:
                medications.update(self._specialty_vocabulary[specialty].get("medications", []))
        else:
            for spec_vocab in self._specialty_vocabulary.values():
                medications.update(spec_vocab.get("medications", []))

        return sorted(medications)

    def get_all_diagnoses(
        self,
        specialty: Optional[MedicalSpecialty] = None,
    ) -> List[str]:
        """Get all diagnosis names, optionally filtered by specialty."""
        diagnoses = set(self._base_vocabulary["diagnoses"])

        if specialty:
            if specialty in self._specialty_vocabulary:
                diagnoses.update(self._specialty_vocabulary[specialty].get("diagnoses", []))
        else:
            for spec_vocab in self._specialty_vocabulary.values():
                diagnoses.update(spec_vocab.get("diagnoses", []))

        return sorted(diagnoses)

    def search_terms(
        self,
        query: str,
        specialty: Optional[MedicalSpecialty] = None,
        limit: int = 10,
    ) -> List[str]:
        """
        Search for medical terms matching a query.

        Args:
            query: Search query
            specialty: Optional specialty filter
            limit: Maximum results

        Returns:
            List of matching terms
        """
        query_lower = query.lower()
        matches = []

        # Search medications
        for med in self.get_all_medications(specialty):
            if query_lower in med.lower():
                matches.append(med)

        # Search diagnoses
        for diag in self.get_all_diagnoses(specialty):
            if query_lower in diag.lower():
                matches.append(diag)

        # Search procedures
        for proc in self._base_vocabulary["procedures"]:
            if query_lower in proc.lower():
                matches.append(proc)

        return matches[:limit]

    def get_specialties(self) -> List[Dict[str, str]]:
        """Get list of available specialties."""
        return [{"id": spec.value, "name": spec.value.replace("_", " ").title()} for spec in MedicalSpecialty]


# Global service instance
medical_vocabulary_service = MedicalVocabularyService()
