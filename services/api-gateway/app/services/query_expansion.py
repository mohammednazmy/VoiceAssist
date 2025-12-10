"""
Query Expansion Service (Phase 5 - Advanced RAG)

Improves search recall by expanding queries with related terms.

Features:
- Medical abbreviation expansion
- Synonym expansion using medical thesaurus
- LLM-based query reformulation
- Query decomposition for multi-aspect questions
- UMLS concept linking for terminology standardization

Query expansion techniques:
1. Lexical: Add synonyms and related terms
2. Semantic: Use embeddings to find similar terms
3. Knowledge-based: Use medical ontologies (UMLS, SNOMED)
4. Neural: Use LLM to reformulate queries
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set

from app.services.cache_service import cache_service, generate_cache_key
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Shared async OpenAI client
_async_openai_client: AsyncOpenAI | None = None


def get_async_openai_client() -> AsyncOpenAI:
    """Get or create async OpenAI client."""
    global _async_openai_client
    if _async_openai_client is None:
        _async_openai_client = AsyncOpenAI()
    return _async_openai_client


class ExpansionMethod(str, Enum):
    """Query expansion methods."""

    ABBREVIATION = "abbreviation"
    SYNONYM = "synonym"
    LLM_REFORMULATION = "llm_reformulation"
    DECOMPOSITION = "decomposition"
    UMLS = "umls"


@dataclass
class ExpandedQuery:
    """Result of query expansion."""

    original_query: str
    expanded_query: str
    expansion_terms: List[str] = field(default_factory=list)
    sub_queries: List[str] = field(default_factory=list)
    method: str = "none"
    confidence: float = 1.0


@dataclass
class QueryExpansionConfig:
    """Configuration for query expansion."""

    enable_abbreviation: bool = True
    enable_synonym: bool = True
    enable_llm: bool = False  # Disabled by default (costs tokens)
    enable_decomposition: bool = True
    max_expansion_terms: int = 5
    synonym_confidence_threshold: float = 0.8
    cache_ttl: int = 3600


# Medical abbreviation dictionary
MEDICAL_ABBREVIATIONS: Dict[str, List[str]] = {
    # Cardiovascular
    "mi": ["myocardial infarction", "heart attack"],
    "cad": ["coronary artery disease"],
    "chf": ["congestive heart failure", "heart failure"],
    "htn": ["hypertension", "high blood pressure"],
    "afib": ["atrial fibrillation", "a-fib"],
    "svt": ["supraventricular tachycardia"],
    "vt": ["ventricular tachycardia"],
    "vf": ["ventricular fibrillation"],
    "av": ["atrioventricular"],
    "bp": ["blood pressure"],
    "hr": ["heart rate"],
    "ecg": ["electrocardiogram", "ekg"],
    "lvef": ["left ventricular ejection fraction"],
    "cabg": ["coronary artery bypass graft", "bypass surgery"],
    "pci": ["percutaneous coronary intervention", "angioplasty"],
    "stemi": ["st-elevation myocardial infarction"],
    "nstemi": ["non-st-elevation myocardial infarction"],
    # Respiratory
    "copd": ["chronic obstructive pulmonary disease"],
    "sob": ["shortness of breath", "dyspnea"],
    "pe": ["pulmonary embolism"],
    "ards": ["acute respiratory distress syndrome"],
    "cxr": ["chest x-ray", "chest radiograph"],
    "ct": ["computed tomography"],
    "pft": ["pulmonary function test"],
    "fev1": ["forced expiratory volume in 1 second"],
    "fvc": ["forced vital capacity"],
    # Neurological
    "cva": ["cerebrovascular accident", "stroke"],
    "tia": ["transient ischemic attack", "mini-stroke"],
    "ms": ["multiple sclerosis"],
    "als": ["amyotrophic lateral sclerosis", "lou gehrig's disease"],
    "lp": ["lumbar puncture", "spinal tap"],
    "mri": ["magnetic resonance imaging"],
    "eeg": ["electroencephalogram"],
    "loc": ["loss of consciousness"],
    "gcs": ["glasgow coma scale"],
    # Gastrointestinal
    "gerd": ["gastroesophageal reflux disease", "acid reflux"],
    "ibs": ["irritable bowel syndrome"],
    "ibd": ["inflammatory bowel disease"],
    "uc": ["ulcerative colitis"],
    "gi": ["gastrointestinal"],
    "npo": ["nothing by mouth", "nil per os"],
    "lfts": ["liver function tests"],
    "ercp": ["endoscopic retrograde cholangiopancreatography"],
    # Endocrine
    "dm": ["diabetes mellitus", "diabetes"],
    "t1dm": ["type 1 diabetes mellitus"],
    "t2dm": ["type 2 diabetes mellitus"],
    "hba1c": ["hemoglobin a1c", "glycated hemoglobin"],
    "dka": ["diabetic ketoacidosis"],
    "tsh": ["thyroid stimulating hormone"],
    "t3": ["triiodothyronine"],
    "t4": ["thyroxine"],
    # Renal
    "ckd": ["chronic kidney disease"],
    "aki": ["acute kidney injury"],
    "esrd": ["end-stage renal disease"],
    "gfr": ["glomerular filtration rate"],
    "egfr": ["estimated glomerular filtration rate"],
    "bun": ["blood urea nitrogen"],
    "creatinine": ["cr", "creat"],
    "hd": ["hemodialysis"],
    "pd": ["peritoneal dialysis"],
    # Infectious Disease
    "uti": ["urinary tract infection"],
    "uri": ["upper respiratory infection"],
    "lrti": ["lower respiratory tract infection"],
    "cap": ["community-acquired pneumonia"],
    "hap": ["hospital-acquired pneumonia"],
    "mrsa": ["methicillin-resistant staphylococcus aureus"],
    "vre": ["vancomycin-resistant enterococcus"],
    "hiv": ["human immunodeficiency virus"],
    "aids": ["acquired immunodeficiency syndrome"],
    "tb": ["tuberculosis"],
    # Hematology/Oncology
    "wbc": ["white blood cell", "leukocyte"],
    "rbc": ["red blood cell", "erythrocyte"],
    "plt": ["platelet", "thrombocyte"],
    "hgb": ["hemoglobin"],
    "hct": ["hematocrit"],
    "inr": ["international normalized ratio"],
    "pt": ["prothrombin time"],
    "ptt": ["partial thromboplastin time"],
    "dvt": ["deep vein thrombosis"],
    "aml": ["acute myeloid leukemia"],
    "all": ["acute lymphoblastic leukemia"],
    "cll": ["chronic lymphocytic leukemia"],
    "cml": ["chronic myeloid leukemia"],
    # Musculoskeletal
    "ra": ["rheumatoid arthritis"],
    "oa": ["osteoarthritis"],
    "sle": ["systemic lupus erythematosus", "lupus"],
    "rom": ["range of motion"],
    "orif": ["open reduction internal fixation"],
    # Medications
    "nsaid": ["non-steroidal anti-inflammatory drug", "ibuprofen", "naproxen"],
    "ace": ["angiotensin converting enzyme inhibitor", "ace inhibitor"],
    "arb": ["angiotensin receptor blocker"],
    "bb": ["beta blocker"],
    "ccb": ["calcium channel blocker"],
    "ssri": ["selective serotonin reuptake inhibitor"],
    "snri": ["serotonin-norepinephrine reuptake inhibitor"],
    "tca": ["tricyclic antidepressant"],
    "ppi": ["proton pump inhibitor"],
    "abx": ["antibiotics"],
    "pcn": ["penicillin"],
    "prn": ["as needed", "pro re nata"],
    "bid": ["twice daily"],
    "tid": ["three times daily"],
    "qid": ["four times daily"],
    "qd": ["once daily"],
    "qhs": ["at bedtime"],
    "po": ["by mouth", "oral"],
    "iv": ["intravenous"],
    "im": ["intramuscular"],
    "sq": ["subcutaneous"],
    # Clinical Findings
    "cp": ["chest pain"],
    "ha": ["headache"],
    "n/v": ["nausea and vomiting"],
    "abd": ["abdominal"],
    "r/o": ["rule out"],
    "h/o": ["history of"],
    "s/p": ["status post"],
    "c/o": ["complaining of"],
    "hpi": ["history of present illness"],
    "pmh": ["past medical history"],
    "psh": ["past surgical history"],
    "fh": ["family history"],
    "sh": ["social history"],
    "ros": ["review of systems"],
    "phys_exam": ["physical exam", "physical examination"],
    "a/p": ["assessment and plan"],
    "dx": ["diagnosis"],
    "ddx": ["differential diagnosis"],
    "tx": ["treatment"],
    "rx": ["prescription"],
    "f/u": ["follow up"],
}

# Medical synonyms (simplified)
MEDICAL_SYNONYMS: Dict[str, List[str]] = {
    "pain": ["ache", "discomfort", "soreness", "tenderness"],
    "fever": ["pyrexia", "elevated temperature", "febrile"],
    "swelling": ["edema", "oedema", "inflammation"],
    "rash": ["eruption", "exanthem", "dermatitis"],
    "fatigue": ["tiredness", "exhaustion", "weakness", "malaise"],
    "nausea": ["queasiness", "stomach upset"],
    "vomiting": ["emesis", "throwing up"],
    "diarrhea": ["loose stools", "frequent bowel movements"],
    "constipation": ["hard stools", "infrequent bowel movements"],
    "cough": ["tussis"],
    "headache": ["cephalalgia", "head pain"],
    "dizziness": ["vertigo", "lightheadedness"],
    "infection": ["sepsis", "infectious disease"],
    "inflammation": ["swelling", "inflammatory response"],
    "bleeding": ["hemorrhage", "haemorrhage"],
    "cancer": ["malignancy", "neoplasm", "tumor", "tumour"],
    "heart attack": ["myocardial infarction", "mi"],
    "stroke": ["cva", "cerebrovascular accident"],
    "high blood pressure": ["hypertension", "htn"],
    "diabetes": ["dm", "diabetes mellitus"],
    "kidney disease": ["renal disease", "nephropathy"],
    "liver disease": ["hepatic disease", "hepatopathy"],
}


class QueryExpansionService:
    """
    Main query expansion service.

    Orchestrates different expansion methods to improve search recall.
    """

    def __init__(
        self,
        config: Optional[QueryExpansionConfig] = None,
    ):
        self.config = config or QueryExpansionConfig()
        self._llm_client = None

    async def expand(
        self,
        query: str,
        methods: Optional[List[ExpansionMethod]] = None,
    ) -> ExpandedQuery:
        """
        Expand a query using configured methods.

        Args:
            query: Original search query
            methods: Specific methods to use (default: all enabled)

        Returns:
            Expanded query with additional terms
        """
        # Check cache
        cache_key = generate_cache_key("query_expansion", query)
        cached = await cache_service.get(cache_key)
        if cached is not None:
            return ExpandedQuery(**cached)

        # Determine methods to use
        if methods is None:
            methods = []
            if self.config.enable_abbreviation:
                methods.append(ExpansionMethod.ABBREVIATION)
            if self.config.enable_synonym:
                methods.append(ExpansionMethod.SYNONYM)
            if self.config.enable_llm:
                methods.append(ExpansionMethod.LLM_REFORMULATION)

        # Apply expansions
        expansion_terms: Set[str] = set()
        expanded_query = query

        if ExpansionMethod.ABBREVIATION in methods:
            abbrev_terms = self._expand_abbreviations(query)
            expansion_terms.update(abbrev_terms)

        if ExpansionMethod.SYNONYM in methods:
            synonym_terms = self._expand_synonyms(query)
            expansion_terms.update(synonym_terms)

        if ExpansionMethod.LLM_REFORMULATION in methods:
            llm_result = await self._llm_reformulation(query)
            if llm_result:
                expansion_terms.update(llm_result)

        # Limit expansion terms
        expansion_list = list(expansion_terms)[: self.config.max_expansion_terms]

        # Build expanded query
        if expansion_list:
            expanded_query = f"{query} {' '.join(expansion_list)}"

        result = ExpandedQuery(
            original_query=query,
            expanded_query=expanded_query,
            expansion_terms=expansion_list,
            method=",".join(m.value for m in methods),
        )

        # Cache result
        await cache_service.set(
            cache_key,
            {
                "original_query": result.original_query,
                "expanded_query": result.expanded_query,
                "expansion_terms": result.expansion_terms,
                "sub_queries": result.sub_queries,
                "method": result.method,
                "confidence": result.confidence,
            },
            ttl=self.config.cache_ttl,
        )

        return result

    def _expand_abbreviations(self, query: str) -> List[str]:
        """Expand medical abbreviations in query."""
        expansions = []
        query_lower = query.lower()
        words = re.findall(r"\b[a-z0-9]+\b", query_lower)

        for word in words:
            if word in MEDICAL_ABBREVIATIONS:
                expansions.extend(MEDICAL_ABBREVIATIONS[word])

        return expansions

    def _expand_synonyms(self, query: str) -> List[str]:
        """Expand with synonyms."""
        expansions = []
        query_lower = query.lower()

        for term, synonyms in MEDICAL_SYNONYMS.items():
            if term in query_lower:
                # Add synonyms (limit to avoid query explosion)
                expansions.extend(synonyms[:2])

        return expansions

    async def _llm_reformulation(self, query: str) -> List[str]:
        """Use LLM to suggest query reformulations."""
        try:
            prompt = (
                "Given the medical search query below, suggest 3 alternative "
                "phrasings or related terms that might help find relevant information.\n\n"
                f"Query: {query}\n\n"
                "Provide only the alternative terms/phrasings, one per line, "
                "without numbering or explanations:"
            )

            client = get_async_openai_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100,
                temperature=0.3,
            )

            suggestions = response.choices[0].message.content.strip().split("\n")
            return [s.strip() for s in suggestions if s.strip() and len(s.strip()) > 3]

        except Exception as e:
            logger.error(f"LLM reformulation error: {e}")
            return []

    async def decompose(self, query: str) -> List[str]:
        """
        Decompose a complex query into sub-queries.

        Useful for multi-aspect questions like:
        "What are the symptoms, causes, and treatment of diabetes?"
        """
        # Check cache
        cache_key = generate_cache_key("query_decomposition", query)
        cached = await cache_service.get(cache_key)
        if cached is not None:
            return cached

        # Simple rule-based decomposition
        sub_queries = []

        # Check for conjunctions
        conjunction_patterns = [
            r"\band\b",
            r"\bor\b",
            r",\s*(?:and|or)?\s*",
        ]

        # Check for question words
        question_words = ["what", "how", "why", "when", "where", "which"]
        has_multiple_questions = sum(1 for w in question_words if w in query.lower()) > 1

        # If complex query, use LLM decomposition
        if has_multiple_questions or any(re.search(p, query, re.I) for p in conjunction_patterns):
            sub_queries = await self._llm_decomposition(query)

        if not sub_queries:
            sub_queries = [query]

        # Cache
        await cache_service.set(cache_key, sub_queries, ttl=self.config.cache_ttl)

        return sub_queries

    async def _llm_decomposition(self, query: str) -> List[str]:
        """Use LLM to decompose complex query."""
        try:
            prompt = (
                "Break down this complex medical question into simpler sub-questions "
                "that can be searched separately.\n\n"
                f"Complex question: {query}\n\n"
                "Provide the sub-questions, one per line. "
                "If the question is already simple, just return it as-is:"
            )

            client = get_async_openai_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.2,
            )

            sub_queries = response.choices[0].message.content.strip().split("\n")
            return [q.strip() for q in sub_queries if q.strip() and len(q.strip()) > 10]

        except Exception as e:
            logger.error(f"LLM decomposition error: {e}")
            return []

    async def normalize_terminology(self, query: str) -> str:
        """
        Normalize medical terminology to standard forms.

        In production, this would use UMLS for concept normalization.
        """
        normalized = query

        # Simple normalization rules
        normalizations = {
            r"\bheart attack\b": "myocardial infarction",
            r"\bstroke\b": "cerebrovascular accident",
            r"\bhigh blood pressure\b": "hypertension",
            r"\bhigh cholesterol\b": "hyperlipidemia",
            r"\bkidney failure\b": "renal failure",
            r"\bliver failure\b": "hepatic failure",
            r"\bsugar\b": "glucose",
            r"\bblood thinners?\b": "anticoagulants",
        }

        for pattern, replacement in normalizations.items():
            normalized = re.sub(pattern, replacement, normalized, flags=re.I)

        return normalized

    async def extract_entities(self, query: str) -> Dict[str, List[str]]:
        """
        Extract medical entities from query.

        Returns dict with entity types: diseases, drugs, symptoms, etc.
        """
        entities: Dict[str, List[str]] = {
            "diseases": [],
            "drugs": [],
            "symptoms": [],
            "procedures": [],
            "anatomy": [],
        }

        query_lower = query.lower()

        # Simple pattern-based extraction
        # In production, use NER models (scispaCy, etc.)

        # Check for common disease patterns
        disease_indicators = [
            "disease",
            "syndrome",
            "disorder",
            "infection",
            "cancer",
            "itis",
            "osis",
            "emia",
            "pathy",
        ]
        for indicator in disease_indicators:
            if indicator in query_lower:
                # Extract surrounding context
                words = query_lower.split()
                for i, word in enumerate(words):
                    if indicator in word:
                        # Get word and maybe preceding adjective
                        if i > 0:
                            entities["diseases"].append(f"{words[i-1]} {word}")
                        else:
                            entities["diseases"].append(word)

        # Check for drug-related terms
        drug_suffixes = ["mab", "nib", "pril", "olol", "sartan", "statin", "cillin"]
        for suffix in drug_suffixes:
            pattern = rf"\b\w+{suffix}\b"
            matches = re.findall(pattern, query_lower)
            entities["drugs"].extend(matches)

        # Check for symptoms
        symptom_terms = [
            "pain",
            "ache",
            "fever",
            "fatigue",
            "nausea",
            "vomiting",
            "cough",
        ]
        for term in symptom_terms:
            if term in query_lower:
                entities["symptoms"].append(term)

        return entities
