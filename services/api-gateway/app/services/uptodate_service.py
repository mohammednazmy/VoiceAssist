"""
UpToDate API Service

Integration with UpToDate clinical decision support system:
- Topic search and retrieval
- Drug interaction checking
- Medical graphics access
- Evidence-based recommendations

Note: Requires enterprise license from UpToDate (~$500-1500/month).
API rate limits vary by license tier.
"""

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class Specialty(Enum):
    """Medical specialties supported by UpToDate"""

    ALLERGY_IMMUNOLOGY = "allergy-immunology"
    CARDIOLOGY = "cardiology"
    DERMATOLOGY = "dermatology"
    EMERGENCY_MEDICINE = "emergency-medicine"
    ENDOCRINOLOGY = "endocrinology"
    FAMILY_MEDICINE = "family-medicine"
    GASTROENTEROLOGY = "gastroenterology"
    GENERAL_SURGERY = "general-surgery"
    GERIATRICS = "geriatrics"
    HEMATOLOGY = "hematology"
    INFECTIOUS_DISEASE = "infectious-disease"
    INTERNAL_MEDICINE = "internal-medicine"
    NEPHROLOGY = "nephrology"
    NEUROLOGY = "neurology"
    OBSTETRICS_GYNECOLOGY = "obstetrics-gynecology"
    ONCOLOGY = "oncology"
    OPHTHALMOLOGY = "ophthalmology"
    ORTHOPEDICS = "orthopedics"
    PEDIATRICS = "pediatrics"
    PSYCHIATRY = "psychiatry"
    PULMONOLOGY = "pulmonology"
    RHEUMATOLOGY = "rheumatology"
    UROLOGY = "urology"


class InteractionSeverity(Enum):
    """Drug interaction severity levels"""

    CONTRAINDICATED = "contraindicated"
    MAJOR = "major"
    MODERATE = "moderate"
    MINOR = "minor"
    UNKNOWN = "unknown"


@dataclass
class UpToDateTopic:
    """UpToDate topic search result"""

    id: str
    title: str
    specialty: Optional[str] = None
    last_updated: Optional[str] = None
    relevance_score: float = 0.0
    url: Optional[str] = None


@dataclass
class TopicSection:
    """Section within an UpToDate topic"""

    title: str
    content: str
    subsections: List["TopicSection"] = field(default_factory=list)


@dataclass
class Reference:
    """Literature reference"""

    citation: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None


@dataclass
class UpToDateContent:
    """Full topic content from UpToDate"""

    id: str
    title: str
    sections: List[TopicSection] = field(default_factory=list)
    references: List[Reference] = field(default_factory=list)
    last_updated: Optional[str] = None
    authors: List[str] = field(default_factory=list)
    summary: Optional[str] = None
    grade_of_evidence: Optional[str] = None


@dataclass
class DrugInteraction:
    """Drug-drug interaction result"""

    drug1: str
    drug2: str
    severity: InteractionSeverity
    description: str
    mechanism: Optional[str] = None
    management: Optional[str] = None
    clinical_effects: Optional[str] = None
    references: List[Reference] = field(default_factory=list)


@dataclass
class DrugInteractionResult:
    """Complete drug interaction check result"""

    drugs: List[str]
    interactions: List[DrugInteraction]
    has_contraindicated: bool = False
    has_major: bool = False
    checked_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class MedicalGraphic:
    """Medical graphic/image from UpToDate"""

    id: str
    title: str
    description: Optional[str] = None
    image_url: str
    thumbnail_url: Optional[str] = None
    topic_id: Optional[str] = None


@dataclass
class CalculatorInput:
    """Input parameter for a medical calculator"""

    name: str
    label: str
    type: str  # integer, float, boolean, string
    required: bool = True
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    enum_values: Optional[List[str]] = None
    unit: Optional[str] = None
    default: Optional[Any] = None


@dataclass
class CalculatorResult:
    """Result from running a medical calculator"""

    calculator_id: str
    calculator_name: str
    inputs: Dict[str, Any]
    result: float
    result_unit: Optional[str] = None
    interpretation: Optional[str] = None
    recommendation: Optional[str] = None
    risk_level: Optional[str] = None
    references: List[Reference] = field(default_factory=list)


class UpToDateService:
    """
    UpToDate API integration for clinical decision support.

    This service provides access to UpToDate's clinical knowledge base:
    - Topic search and retrieval
    - Drug interaction checking
    - Medical graphics
    - Calculator integration

    API Endpoints used:
    - /search: Topic search
    - /topics/{id}: Topic content
    - /graphics/{id}: Medical graphics
    - /drug-interactions: Drug interaction checker

    Note: Requires enterprise API license from UpToDate.
    Rate limits and access depend on license tier.
    """

    BASE_URL = "https://api.uptodate.com/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        cache_service: Optional[Any] = None,
    ):
        """
        Initialize UpToDate service.

        Args:
            api_key: UpToDate API key (defaults to settings)
            api_secret: UpToDate API secret (defaults to settings)
            cache_service: Optional cache service for response caching
        """
        self.api_key = api_key or getattr(settings, "UPTODATE_API_KEY", "")
        self.api_secret = api_secret or getattr(settings, "UPTODATE_API_SECRET", "")
        self.cache = cache_service
        self._client: Optional[httpx.AsyncClient] = None

        logger.info(
            "UpToDateService initialized",
            extra={"has_api_key": bool(self.api_key)},
        )

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=30.0,
                headers={"User-Agent": "VoiceAssist/1.0"},
            )
        return self._client

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _generate_auth_signature(self, timestamp: str) -> str:
        """
        Generate HMAC signature for API authentication.

        Args:
            timestamp: Unix timestamp string

        Returns:
            HMAC-SHA256 signature
        """
        message = f"{self.api_key}{timestamp}"
        signature = hmac.new(
            self.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return signature

    def _get_auth_headers(self) -> Dict[str, str]:
        """Generate authentication headers for API requests."""
        timestamp = str(int(time.time()))
        signature = self._generate_auth_signature(timestamp)

        return {
            "X-API-Key": self.api_key,
            "X-Timestamp": timestamp,
            "X-Signature": signature,
            "Content-Type": "application/json",
        }

    def _get_cache_key(self, prefix: str, *args) -> str:
        """Generate cache key from arguments."""
        key_parts = [prefix] + [str(arg) for arg in args if arg]
        key_str = ":".join(key_parts)
        return f"uptodate:{hashlib.md5(key_str.encode()).hexdigest()}"

    async def _cached_get(self, cache_key: str, ttl: int = 3600) -> Optional[Dict[str, Any]]:
        """Get cached response if available."""
        if self.cache:
            try:
                return await self.cache.get(cache_key)
            except Exception as e:
                logger.warning(f"Cache get failed: {e}")
        return None

    async def _cached_set(self, cache_key: str, data: Dict[str, Any], ttl: int = 3600):
        """Set cached response."""
        if self.cache:
            try:
                await self.cache.set(cache_key, data, ttl=ttl)
            except Exception as e:
                logger.warning(f"Cache set failed: {e}")

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make authenticated API request.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            params: Query parameters
            json_data: JSON body data

        Returns:
            API response as dictionary

        Raises:
            httpx.HTTPStatusError: On API error
        """
        if not self.api_key:
            raise ValueError("UpToDate API key not configured")

        client = await self._get_client()
        headers = self._get_auth_headers()

        url = f"{self.BASE_URL}{endpoint}"

        logger.debug(
            "UpToDate API request",
            extra={"method": method, "endpoint": endpoint},
        )

        response = await client.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_data,
        )

        response.raise_for_status()
        return response.json()

    async def search_topics(
        self,
        query: str,
        max_results: int = 10,
        specialty: Optional[Specialty] = None,
    ) -> List[UpToDateTopic]:
        """
        Search UpToDate topics.

        Args:
            query: Search query
            max_results: Maximum number of results (1-50)
            specialty: Filter by medical specialty

        Returns:
            List of matching topics
        """
        specialty_value = specialty.value if specialty else None
        cache_key = self._get_cache_key("search", query, max_results, specialty_value)

        # Check cache
        cached = await self._cached_get(cache_key)
        if cached:
            logger.debug("Cache hit for topic search")
            return [UpToDateTopic(**t) for t in cached]

        # Make API request
        params = {
            "q": query,
            "limit": min(max_results, 50),
        }
        if specialty_value:
            params["specialty"] = specialty_value

        try:
            response = await self._request("GET", "/search", params=params)

            topics = [
                UpToDateTopic(
                    id=item.get("id", ""),
                    title=item.get("title", ""),
                    specialty=item.get("specialty"),
                    last_updated=item.get("lastUpdated"),
                    relevance_score=item.get("score", 0.0),
                    url=item.get("url"),
                )
                for item in response.get("results", [])
            ]

            # Cache results
            await self._cached_set(cache_key, [self._topic_to_dict(t) for t in topics], ttl=3600)

            logger.info(
                "UpToDate search completed",
                extra={"query": query[:50], "results": len(topics)},
            )

            return topics

        except httpx.HTTPStatusError as e:
            logger.error(f"UpToDate search failed: {e}")
            raise
        except Exception as e:
            logger.error(f"UpToDate search error: {e}")
            return []

    async def get_topic_content(
        self,
        topic_id: str,
        section: Optional[str] = None,
    ) -> Optional[UpToDateContent]:
        """
        Get full topic content.

        Args:
            topic_id: UpToDate topic ID
            section: Optional specific section to retrieve

        Returns:
            Full topic content or None if not found
        """
        cache_key = self._get_cache_key("topic", topic_id, section)

        # Check cache (longer TTL for full content)
        cached = await self._cached_get(cache_key)
        if cached:
            logger.debug("Cache hit for topic content")
            return self._dict_to_content(cached)

        try:
            params = {}
            if section:
                params["section"] = section

            response = await self._request("GET", f"/topics/{topic_id}", params=params)

            content = UpToDateContent(
                id=topic_id,
                title=response.get("title", ""),
                sections=self._parse_sections(response.get("sections", [])),
                references=self._parse_references(response.get("references", [])),
                last_updated=response.get("lastUpdated"),
                authors=response.get("authors", []),
                summary=response.get("summary"),
                grade_of_evidence=response.get("gradeOfEvidence"),
            )

            # Cache for 24 hours
            await self._cached_set(cache_key, self._content_to_dict(content), ttl=86400)

            logger.info(
                "Retrieved topic content",
                extra={"topic_id": topic_id, "title": content.title[:50]},
            )

            return content

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            logger.error(f"Failed to get topic content: {e}")
            raise
        except Exception as e:
            logger.error(f"Error getting topic content: {e}")
            return None

    async def check_drug_interactions(
        self,
        drugs: List[str],
    ) -> DrugInteractionResult:
        """
        Check for drug-drug interactions.

        Args:
            drugs: List of drug names to check

        Returns:
            DrugInteractionResult with all interactions found
        """
        if len(drugs) < 2:
            return DrugInteractionResult(
                drugs=drugs,
                interactions=[],
            )

        try:
            response = await self._request(
                "POST",
                "/drug-interactions",
                json_data={"drugs": drugs},
            )

            interactions = []
            for item in response.get("interactions", []):
                severity = InteractionSeverity.UNKNOWN
                try:
                    severity = InteractionSeverity(item.get("severity", "unknown"))
                except ValueError:
                    pass

                interactions.append(
                    DrugInteraction(
                        drug1=item.get("drug1", ""),
                        drug2=item.get("drug2", ""),
                        severity=severity,
                        description=item.get("description", ""),
                        mechanism=item.get("mechanism"),
                        management=item.get("management"),
                        clinical_effects=item.get("clinicalEffects"),
                        references=self._parse_references(item.get("references", [])),
                    )
                )

            result = DrugInteractionResult(
                drugs=drugs,
                interactions=interactions,
                has_contraindicated=any(i.severity == InteractionSeverity.CONTRAINDICATED for i in interactions),
                has_major=any(i.severity == InteractionSeverity.MAJOR for i in interactions),
            )

            logger.info(
                "Drug interaction check completed",
                extra={
                    "drugs_count": len(drugs),
                    "interactions_found": len(interactions),
                    "has_major": result.has_major,
                },
            )

            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"Drug interaction check failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Drug interaction error: {e}")
            return DrugInteractionResult(drugs=drugs, interactions=[])

    async def get_graphics(
        self,
        topic_id: str,
    ) -> List[MedicalGraphic]:
        """
        Get medical graphics for a topic.

        Args:
            topic_id: UpToDate topic ID

        Returns:
            List of medical graphics
        """
        cache_key = self._get_cache_key("graphics", topic_id)

        cached = await self._cached_get(cache_key)
        if cached:
            return [MedicalGraphic(**g) for g in cached]

        try:
            response = await self._request("GET", f"/topics/{topic_id}/graphics")

            graphics = [
                MedicalGraphic(
                    id=item.get("id", ""),
                    title=item.get("title", ""),
                    description=item.get("description"),
                    image_url=item.get("imageUrl", ""),
                    thumbnail_url=item.get("thumbnailUrl"),
                    topic_id=topic_id,
                )
                for item in response.get("graphics", [])
            ]

            await self._cached_set(
                cache_key,
                [self._graphic_to_dict(g) for g in graphics],
                ttl=86400,
            )

            return graphics

        except Exception as e:
            logger.error(f"Failed to get graphics: {e}")
            return []

    def _parse_sections(self, sections_data: List[Dict]) -> List[TopicSection]:
        """Parse section data into TopicSection objects."""
        sections = []
        for item in sections_data:
            section = TopicSection(
                title=item.get("title", ""),
                content=item.get("content", ""),
                subsections=self._parse_sections(item.get("subsections", [])),
            )
            sections.append(section)
        return sections

    def _parse_references(self, refs_data: List[Dict]) -> List[Reference]:
        """Parse reference data into Reference objects."""
        return [
            Reference(
                citation=ref.get("citation", ""),
                pmid=ref.get("pmid"),
                doi=ref.get("doi"),
                url=ref.get("url"),
            )
            for ref in refs_data
        ]

    def _topic_to_dict(self, topic: UpToDateTopic) -> Dict[str, Any]:
        """Convert topic to dictionary for caching."""
        return {
            "id": topic.id,
            "title": topic.title,
            "specialty": topic.specialty,
            "last_updated": topic.last_updated,
            "relevance_score": topic.relevance_score,
            "url": topic.url,
        }

    def _content_to_dict(self, content: UpToDateContent) -> Dict[str, Any]:
        """Convert content to dictionary for caching."""
        return {
            "id": content.id,
            "title": content.title,
            "sections": [self._section_to_dict(s) for s in content.sections],
            "references": [self._ref_to_dict(r) for r in content.references],
            "last_updated": content.last_updated,
            "authors": content.authors,
            "summary": content.summary,
            "grade_of_evidence": content.grade_of_evidence,
        }

    def _dict_to_content(self, data: Dict[str, Any]) -> UpToDateContent:
        """Convert dictionary to UpToDateContent."""
        return UpToDateContent(
            id=data["id"],
            title=data["title"],
            sections=self._parse_sections(data.get("sections", [])),
            references=self._parse_references(data.get("references", [])),
            last_updated=data.get("last_updated"),
            authors=data.get("authors", []),
            summary=data.get("summary"),
            grade_of_evidence=data.get("grade_of_evidence"),
        )

    def _section_to_dict(self, section: TopicSection) -> Dict[str, Any]:
        """Convert section to dictionary."""
        return {
            "title": section.title,
            "content": section.content,
            "subsections": [self._section_to_dict(s) for s in section.subsections],
        }

    def _ref_to_dict(self, ref: Reference) -> Dict[str, Any]:
        """Convert reference to dictionary."""
        return {
            "citation": ref.citation,
            "pmid": ref.pmid,
            "doi": ref.doi,
            "url": ref.url,
        }

    def _graphic_to_dict(self, graphic: MedicalGraphic) -> Dict[str, Any]:
        """Convert graphic to dictionary."""
        return {
            "id": graphic.id,
            "title": graphic.title,
            "description": graphic.description,
            "image_url": graphic.image_url,
            "thumbnail_url": graphic.thumbnail_url,
            "topic_id": graphic.topic_id,
        }


# Global service instance
uptodate_service = UpToDateService()
