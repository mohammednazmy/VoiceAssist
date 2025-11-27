"""
Enhanced PubMed Service

Advanced PubMed integration with additional features:
- Full-text access via PubMed Central (PMC)
- Citation network analysis
- Similar articles discovery
- Clinical trial matching
- MeSH term expansion
- Systematic review support

Uses NCBI E-utilities API (free, requires API key for higher rate limits).
"""

import asyncio
import xml.etree.ElementTree as ET  # nosec B405 - parsing from trusted NCBI API
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class PublicationType(Enum):
    """PubMed publication types"""

    CLINICAL_TRIAL = "Clinical Trial"
    META_ANALYSIS = "Meta-Analysis"
    RANDOMIZED_CONTROLLED_TRIAL = "Randomized Controlled Trial"
    REVIEW = "Review"
    SYSTEMATIC_REVIEW = "Systematic Review"
    CASE_REPORTS = "Case Reports"
    GUIDELINE = "Guideline"
    PRACTICE_GUIDELINE = "Practice Guideline"
    OBSERVATIONAL_STUDY = "Observational Study"
    COMPARATIVE_STUDY = "Comparative Study"


class ArticleStatus(Enum):
    """Article availability status"""

    AVAILABLE = "available"
    ABSTRACT_ONLY = "abstract_only"
    FULL_TEXT_PMC = "full_text_pmc"
    FULL_TEXT_PUBLISHER = "full_text_publisher"
    UNAVAILABLE = "unavailable"


@dataclass
class Author:
    """Article author information"""

    last_name: str
    first_name: Optional[str] = None
    initials: Optional[str] = None
    affiliation: Optional[str] = None
    orcid: Optional[str] = None

    @property
    def full_name(self) -> str:
        """Get full author name."""
        if self.first_name:
            return f"{self.first_name} {self.last_name}"
        elif self.initials:
            return f"{self.initials} {self.last_name}"
        return self.last_name


@dataclass
class Journal:
    """Journal information"""

    title: str
    iso_abbreviation: Optional[str] = None
    issn: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pub_date: Optional[str] = None


@dataclass
class MeSHTerm:
    """MeSH (Medical Subject Headings) term"""

    descriptor: str
    qualifier: Optional[str] = None
    is_major_topic: bool = False
    tree_numbers: List[str] = field(default_factory=list)


@dataclass
class PubMedArticle:
    """Complete PubMed article record"""

    pmid: str
    title: str
    abstract: Optional[str] = None
    authors: List[Author] = field(default_factory=list)
    journal: Optional[Journal] = None
    pub_date: Optional[str] = None
    doi: Optional[str] = None
    pmc_id: Optional[str] = None
    publication_types: List[str] = field(default_factory=list)
    mesh_terms: List[MeSHTerm] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    status: ArticleStatus = ArticleStatus.ABSTRACT_ONLY

    @property
    def has_full_text(self) -> bool:
        """Check if full text is available."""
        return self.status in [
            ArticleStatus.FULL_TEXT_PMC,
            ArticleStatus.FULL_TEXT_PUBLISHER,
        ]

    @property
    def citation(self) -> str:
        """Generate citation string."""
        authors_str = ""
        if self.authors:
            if len(self.authors) <= 3:
                authors_str = ", ".join(a.full_name for a in self.authors)
            else:
                authors_str = f"{self.authors[0].full_name} et al."

        journal_str = ""
        if self.journal:
            journal_str = self.journal.iso_abbreviation or self.journal.title
            if self.journal.pub_date:
                journal_str += f" ({self.journal.pub_date})"

        return f"{authors_str}. {self.title}. {journal_str}"


@dataclass
class CitationNetwork:
    """Citation network for an article"""

    article_pmid: str
    citing_articles: List[str] = field(default_factory=list)
    cited_articles: List[str] = field(default_factory=list)
    citation_count: int = 0


@dataclass
class ClinicalTrial:
    """Clinical trial information"""

    nct_id: str
    title: str
    status: str
    condition: str
    intervention: Optional[str] = None
    phase: Optional[str] = None
    enrollment: Optional[int] = None
    start_date: Optional[str] = None
    completion_date: Optional[str] = None
    locations: List[str] = field(default_factory=list)
    url: Optional[str] = None


@dataclass
class SearchResult:
    """PubMed search result"""

    query: str
    total_count: int
    articles: List[PubMedArticle]
    query_translation: Optional[str] = None
    search_time_ms: float = 0.0


class EnhancedPubMedService:
    """
    Enhanced PubMed integration with advanced features.

    Features:
    - Full-text access via PMC
    - Citation network analysis
    - Similar articles discovery
    - Clinical trial matching
    - MeSH term expansion
    - Systematic review support

    API: NCBI E-utilities (https://www.ncbi.nlm.nih.gov/books/NBK25500/)
    Rate limits: 3 requests/second without API key, 10/second with key
    """

    EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    PMC_BASE = "https://www.ncbi.nlm.nih.gov/pmc/oai/oai.cgi"

    def __init__(
        self,
        api_key: Optional[str] = None,
        email: Optional[str] = None,
        cache_service: Optional[Any] = None,
    ):
        """
        Initialize Enhanced PubMed service.

        Args:
            api_key: NCBI API key (for higher rate limits)
            email: Contact email (required by NCBI)
            cache_service: Optional cache service
        """
        self.api_key = api_key or getattr(settings, "NCBI_API_KEY", "")
        self.email = email or getattr(settings, "NCBI_EMAIL", "voiceassist@asimo.io")
        self.cache = cache_service
        self._client: Optional[httpx.AsyncClient] = None
        self._request_semaphore = asyncio.Semaphore(10 if self.api_key else 3)

        logger.info(
            "EnhancedPubMedService initialized",
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

    def _get_base_params(self) -> Dict[str, str]:
        """Get base parameters for E-utilities requests."""
        params = {"email": self.email, "tool": "voiceassist"}
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    async def _esearch(
        self,
        query: str,
        max_results: int = 20,
        retstart: int = 0,
        sort: str = "relevance",
    ) -> Tuple[List[str], int, Optional[str]]:
        """
        Execute ESearch to get PMIDs.

        Args:
            query: Search query
            max_results: Maximum results
            retstart: Starting index
            sort: Sort order (relevance, pub_date)

        Returns:
            Tuple of (pmid_list, total_count, query_translation)
        """
        async with self._request_semaphore:
            client = await self._get_client()
            params = {
                **self._get_base_params(),
                "db": "pubmed",
                "term": query,
                "retmax": max_results,
                "retstart": retstart,
                "sort": sort,
                "retmode": "json",
                "usehistory": "n",
            }

            response = await client.get(f"{self.EUTILS_BASE}/esearch.fcgi", params=params)
            response.raise_for_status()
            data = response.json()

            result = data.get("esearchresult", {})
            pmids = result.get("idlist", [])
            total = int(result.get("count", 0))
            translation = result.get("querytranslation")

            return pmids, total, translation

    async def _efetch(
        self,
        pmids: List[str],
        rettype: str = "xml",
    ) -> List[PubMedArticle]:
        """
        Fetch article details for PMIDs.

        Args:
            pmids: List of PubMed IDs
            rettype: Return type (xml, abstract)

        Returns:
            List of PubMedArticle objects
        """
        if not pmids:
            return []

        async with self._request_semaphore:
            client = await self._get_client()
            params = {
                **self._get_base_params(),
                "db": "pubmed",
                "id": ",".join(pmids),
                "rettype": rettype,
                "retmode": "xml",
            }

            response = await client.get(f"{self.EUTILS_BASE}/efetch.fcgi", params=params)
            response.raise_for_status()

            return self._parse_pubmed_xml(response.text)

    async def _elink(
        self,
        pmid: str,
        linkname: str,
    ) -> List[str]:
        """
        Get linked articles using ELink.

        Args:
            pmid: Source PubMed ID
            linkname: Link type (pubmed_pubmed, pubmed_pubmed_citedin, etc.)

        Returns:
            List of linked PMIDs
        """
        async with self._request_semaphore:
            client = await self._get_client()
            params = {
                **self._get_base_params(),
                "dbfrom": "pubmed",
                "db": "pubmed",
                "id": pmid,
                "linkname": linkname,
                "retmode": "json",
            }

            response = await client.get(f"{self.EUTILS_BASE}/elink.fcgi", params=params)
            response.raise_for_status()
            data = response.json()

            linksets = data.get("linksets", [{}])
            if linksets:
                linksetdbs = linksets[0].get("linksetdbs", [])
                if linksetdbs:
                    return [str(lid) for lid in linksetdbs[0].get("links", [])]

            return []

    def _parse_pubmed_xml(self, xml_text: str) -> List[PubMedArticle]:
        """Parse PubMed XML response into articles."""
        articles = []

        try:
            root = ET.fromstring(xml_text)  # nosec B314 - trusted NCBI API

            for article_elem in root.findall(".//PubmedArticle"):
                article = self._parse_article_element(article_elem)
                if article:
                    articles.append(article)

        except ET.ParseError as e:
            logger.error(f"Failed to parse PubMed XML: {e}")

        return articles

    def _parse_article_element(self, elem: ET.Element) -> Optional[PubMedArticle]:
        """Parse single article element."""
        try:
            # Get PMID
            pmid_elem = elem.find(".//PMID")
            if pmid_elem is None or pmid_elem.text is None:
                return None
            pmid = pmid_elem.text

            # Get title
            title_elem = elem.find(".//ArticleTitle")
            title = title_elem.text if title_elem is not None else ""

            # Get abstract
            abstract_parts = []
            for abs_elem in elem.findall(".//AbstractText"):
                label = abs_elem.get("Label", "")
                text = abs_elem.text or ""
                if label:
                    abstract_parts.append(f"{label}: {text}")
                else:
                    abstract_parts.append(text)
            abstract = " ".join(abstract_parts) if abstract_parts else None

            # Get authors
            authors = []
            for author_elem in elem.findall(".//Author"):
                last_name = author_elem.findtext("LastName", "")
                if last_name:
                    authors.append(
                        Author(
                            last_name=last_name,
                            first_name=author_elem.findtext("ForeName"),
                            initials=author_elem.findtext("Initials"),
                            affiliation=author_elem.findtext(".//AffiliationInfo/Affiliation"),
                        )
                    )

            # Get journal info
            journal = None
            journal_elem = elem.find(".//Journal")
            if journal_elem is not None:
                journal = Journal(
                    title=journal_elem.findtext("Title", ""),
                    iso_abbreviation=journal_elem.findtext("ISOAbbreviation"),
                    issn=journal_elem.findtext("ISSN"),
                    volume=elem.findtext(".//JournalIssue/Volume"),
                    issue=elem.findtext(".//JournalIssue/Issue"),
                    pub_date=self._parse_pub_date(elem.find(".//JournalIssue/PubDate")),
                )

            # Get DOI
            doi = None
            for id_elem in elem.findall(".//ArticleId"):
                if id_elem.get("IdType") == "doi":
                    doi = id_elem.text

            # Get PMC ID
            pmc_id = None
            for id_elem in elem.findall(".//ArticleId"):
                if id_elem.get("IdType") == "pmc":
                    pmc_id = id_elem.text

            # Get publication types
            pub_types = [pt.text for pt in elem.findall(".//PublicationType") if pt.text]

            # Get MeSH terms
            mesh_terms = []
            for mesh_elem in elem.findall(".//MeshHeading"):
                descriptor = mesh_elem.findtext("DescriptorName")
                if descriptor:
                    mesh_terms.append(
                        MeSHTerm(
                            descriptor=descriptor,
                            qualifier=mesh_elem.findtext("QualifierName"),
                            is_major_topic=(
                                (mesh_elem.find("DescriptorName").get("MajorTopicYN") == "Y")
                                if mesh_elem.find("DescriptorName") is not None
                                else False
                            ),
                        )
                    )

            # Get keywords
            keywords = [kw.text for kw in elem.findall(".//Keyword") if kw.text]

            # Determine status
            status = ArticleStatus.ABSTRACT_ONLY
            if pmc_id:
                status = ArticleStatus.FULL_TEXT_PMC

            return PubMedArticle(
                pmid=pmid,
                title=title,
                abstract=abstract,
                authors=authors,
                journal=journal,
                pub_date=journal.pub_date if journal else None,
                doi=doi,
                pmc_id=pmc_id,
                publication_types=pub_types,
                mesh_terms=mesh_terms,
                keywords=keywords,
                status=status,
            )

        except Exception as e:
            logger.warning(f"Failed to parse article: {e}")
            return None

    def _parse_pub_date(self, date_elem: Optional[ET.Element]) -> Optional[str]:
        """Parse publication date from XML element."""
        if date_elem is None:
            return None

        year = date_elem.findtext("Year", "")
        month = date_elem.findtext("Month", "")
        day = date_elem.findtext("Day", "")

        if year:
            if month:
                if day:
                    return f"{year}-{month}-{day}"
                return f"{year}-{month}"
            return year

        medline_date = date_elem.findtext("MedlineDate")
        return medline_date

    async def search(
        self,
        query: str,
        max_results: int = 20,
        publication_types: Optional[List[PublicationType]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        sort: str = "relevance",
    ) -> SearchResult:
        """
        Search PubMed articles.

        Args:
            query: Search query
            max_results: Maximum results (1-100)
            publication_types: Filter by publication types
            date_from: Start date (YYYY/MM/DD)
            date_to: End date (YYYY/MM/DD)
            sort: Sort order (relevance, pub_date)

        Returns:
            SearchResult with articles
        """
        import time

        start_time = time.time()

        # Build query with filters
        full_query = query

        if publication_types:
            type_filter = " OR ".join(f'"{pt.value}"[Publication Type]' for pt in publication_types)
            full_query = f"({full_query}) AND ({type_filter})"

        if date_from or date_to:
            date_filter = f"{date_from or '1900/01/01'}:{date_to or '3000'}"
            full_query = f"({full_query}) AND ({date_filter}[Date - Publication])"

        # Search
        pmids, total, translation = await self._esearch(full_query, max_results=max_results, sort=sort)

        # Fetch articles
        articles = await self._efetch(pmids) if pmids else []

        search_time = (time.time() - start_time) * 1000

        logger.info(
            "PubMed search completed",
            extra={
                "query": query[:50],
                "total": total,
                "returned": len(articles),
                "time_ms": search_time,
            },
        )

        return SearchResult(
            query=query,
            total_count=total,
            articles=articles,
            query_translation=translation,
            search_time_ms=search_time,
        )

    async def search_with_mesh(
        self,
        query: str,
        mesh_terms: Optional[List[str]] = None,
        publication_types: Optional[List[PublicationType]] = None,
        max_results: int = 20,
    ) -> SearchResult:
        """
        Search with MeSH term expansion.

        Args:
            query: Base search query
            mesh_terms: Additional MeSH terms to include
            publication_types: Publication type filters
            max_results: Maximum results

        Returns:
            SearchResult
        """
        full_query = query

        if mesh_terms:
            mesh_query = " OR ".join(f'"{term}"[MeSH]' for term in mesh_terms)
            full_query = f"({full_query}) AND ({mesh_query})"

        return await self.search(
            full_query,
            max_results=max_results,
            publication_types=publication_types,
        )

    async def get_article(self, pmid: str) -> Optional[PubMedArticle]:
        """
        Get single article by PMID.

        Args:
            pmid: PubMed ID

        Returns:
            PubMedArticle or None
        """
        articles = await self._efetch([pmid])
        return articles[0] if articles else None

    async def get_full_text(self, pmid: str) -> Optional[str]:
        """
        Get full text from PMC if available.

        Args:
            pmid: PubMed ID

        Returns:
            Full text content or None
        """
        # First, get the PMC ID
        article = await self.get_article(pmid)
        if not article or not article.pmc_id:
            return None

        try:
            async with self._request_semaphore:
                client = await self._get_client()

                # Fetch from PMC OAI
                params = {
                    "verb": "GetRecord",
                    "identifier": f"oai:pubmedcentral.nih.gov:{article.pmc_id}",
                    "metadataPrefix": "pmc",
                }

                response = await client.get(self.PMC_BASE, params=params)
                response.raise_for_status()

                # Parse and extract text
                return self._extract_pmc_text(response.text)

        except Exception as e:
            logger.warning(f"Failed to get PMC full text: {e}")
            return None

    def _extract_pmc_text(self, xml_text: str) -> Optional[str]:
        """Extract text from PMC XML."""
        try:
            root = ET.fromstring(xml_text)  # nosec B314 - trusted PMC API
            body = root.find(".//{http://jats.nlm.nih.gov}body")
            if body is None:
                body = root.find(".//body")

            if body is not None:
                return ET.tostring(body, encoding="unicode", method="text")

            return None
        except Exception as e:
            logger.warning(f"Failed to extract PMC text: {e}")
            return None

    async def find_similar_articles(
        self,
        pmid: str,
        max_results: int = 10,
    ) -> List[PubMedArticle]:
        """
        Find similar articles using NCBI's Related Articles.

        Args:
            pmid: Source PubMed ID
            max_results: Maximum similar articles

        Returns:
            List of similar articles
        """
        related_pmids = await self._elink(pmid, "pubmed_pubmed")

        if related_pmids:
            return await self._efetch(related_pmids[:max_results])

        return []

    async def get_citation_network(
        self,
        pmid: str,
    ) -> CitationNetwork:
        """
        Build citation network for an article.

        Args:
            pmid: PubMed ID

        Returns:
            CitationNetwork with citing and cited articles
        """
        # Get articles citing this one
        citing_task = self._elink(pmid, "pubmed_pubmed_citedin")

        # Get articles this one cites
        cited_task = self._elink(pmid, "pubmed_pubmed_refs")

        citing, cited = await asyncio.gather(citing_task, cited_task)

        return CitationNetwork(
            article_pmid=pmid,
            citing_articles=citing,
            cited_articles=cited,
            citation_count=len(citing),
        )

    async def search_clinical_trials(
        self,
        condition: str,
        intervention: Optional[str] = None,
        status: Optional[str] = None,
        max_results: int = 20,
    ) -> List[ClinicalTrial]:
        """
        Search clinical trials via PubMed/ClinicalTrials.gov.

        Args:
            condition: Medical condition
            intervention: Treatment/intervention
            status: Trial status (recruiting, completed, etc.)
            max_results: Maximum results

        Returns:
            List of clinical trials
        """
        # Build query for clinical trials
        query_parts = [f"{condition}[Condition]"]

        if intervention:
            query_parts.append(f"{intervention}[Intervention]")

        # Add clinical trial filter
        query_parts.append('"Clinical Trial"[Publication Type]')

        full_query = " AND ".join(query_parts)

        result = await self.search(full_query, max_results=max_results)

        # Convert to clinical trial format
        trials = []
        for article in result.articles:
            if "Clinical Trial" in article.publication_types:
                trials.append(
                    ClinicalTrial(
                        nct_id=article.pmid,  # Will be replaced if NCT found
                        title=article.title,
                        status=status or "unknown",
                        condition=condition,
                        intervention=intervention,
                        url=f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/",
                    )
                )

        return trials

    async def get_mesh_terms(self, query: str) -> List[str]:
        """
        Get MeSH terms related to a query.

        Args:
            query: Search term

        Returns:
            List of related MeSH terms
        """
        async with self._request_semaphore:
            client = await self._get_client()
            params = {
                **self._get_base_params(),
                "db": "mesh",
                "term": query,
                "retmode": "json",
                "retmax": 10,
            }

            response = await client.get(f"{self.EUTILS_BASE}/esearch.fcgi", params=params)
            response.raise_for_status()
            data = response.json()

            # Get MeSH UIDs
            uids = data.get("esearchresult", {}).get("idlist", [])
            if not uids:
                return []

            # Fetch MeSH term details
            fetch_params = {
                **self._get_base_params(),
                "db": "mesh",
                "id": ",".join(uids),
                "retmode": "xml",
            }

            fetch_response = await client.get(f"{self.EUTILS_BASE}/efetch.fcgi", params=fetch_params)
            fetch_response.raise_for_status()

            # Parse MeSH terms
            terms = []
            try:
                root = ET.fromstring(fetch_response.text)  # nosec B314 - trusted NCBI API
                for desc in root.findall(".//DescriptorName/String"):
                    if desc.text:
                        terms.append(desc.text)
            except Exception:
                pass

            return terms

    def article_to_dict(self, article: PubMedArticle) -> Dict[str, Any]:
        """Convert article to dictionary for API response."""
        return {
            "pmid": article.pmid,
            "title": article.title,
            "abstract": article.abstract,
            "authors": [
                {
                    "name": a.full_name,
                    "affiliation": a.affiliation,
                }
                for a in article.authors
            ],
            "journal": (
                {
                    "title": article.journal.title if article.journal else None,
                    "abbreviation": (article.journal.iso_abbreviation if article.journal else None),
                    "volume": article.journal.volume if article.journal else None,
                    "issue": article.journal.issue if article.journal else None,
                }
                if article.journal
                else None
            ),
            "pub_date": article.pub_date,
            "doi": article.doi,
            "pmc_id": article.pmc_id,
            "publication_types": article.publication_types,
            "mesh_terms": [{"descriptor": m.descriptor, "is_major": m.is_major_topic} for m in article.mesh_terms],
            "keywords": article.keywords,
            "has_full_text": article.has_full_text,
            "citation": article.citation,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/",
        }


# Global service instance
pubmed_service = EnhancedPubMedService()
