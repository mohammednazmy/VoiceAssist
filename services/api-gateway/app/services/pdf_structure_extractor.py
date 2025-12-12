"""
PDF Structure Extractor Service

Extracts structured content from PDFs including:
- Page-by-page text with character boundaries
- Table of Contents detection (from PDF bookmarks or content)
- Section/chapter detection
- Figure detection with captions
- Document metadata

This enables voice-based document navigation with commands like:
- "Read me page 40"
- "Go to Chapter 3"
- "What's in the table of contents?"
"""

import io
import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from pypdf import PdfReader

logger = logging.getLogger(__name__)


@dataclass
class PageContent:
    """Represents content of a single PDF page."""

    page_number: int
    text: str
    start_char: int  # Start position in full document text
    end_char: int  # End position in full document text
    word_count: int
    has_figures: bool = False
    figures: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class TOCEntry:
    """Represents a table of contents entry."""

    title: str
    level: int  # 1 = chapter, 2 = section, 3 = subsection, etc.
    page_number: int
    section_id: str


@dataclass
class Section:
    """Represents a document section (chapter, section, etc.)."""

    section_id: str
    title: str
    level: int
    start_page: int
    end_page: int
    start_char: int
    end_char: int
    parent_section_id: Optional[str] = None


@dataclass
class Figure:
    """Represents a figure or diagram in the document."""

    figure_id: str
    page_number: int
    caption: str
    description: Optional[str] = None  # AI-generated description
    bbox: Optional[List[float]] = None  # Bounding box [x1, y1, x2, y2]


@dataclass
class DocumentStructure:
    """Complete structure of a PDF document."""

    total_pages: int
    pages: List[PageContent]
    toc: List[TOCEntry]
    sections: List[Section]
    figures: List[Figure]
    full_text: str
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON storage."""
        return {
            "total_pages": self.total_pages,
            "pages": [
                {
                    "page_number": p.page_number,
                    "text": p.text,
                    "start_char": p.start_char,
                    "end_char": p.end_char,
                    "word_count": p.word_count,
                    "has_figures": p.has_figures,
                    "figures": p.figures,
                }
                for p in self.pages
            ],
            "toc": [
                {
                    "title": t.title,
                    "level": t.level,
                    "page_number": t.page_number,
                    "section_id": t.section_id,
                }
                for t in self.toc
            ],
            "sections": [
                {
                    "section_id": s.section_id,
                    "title": s.title,
                    "level": s.level,
                    "start_page": s.start_page,
                    "end_page": s.end_page,
                    "start_char": s.start_char,
                    "end_char": s.end_char,
                    "parent_section_id": s.parent_section_id,
                }
                for s in self.sections
            ],
            "figures": [
                {
                    "figure_id": f.figure_id,
                    "page_number": f.page_number,
                    "caption": f.caption,
                    "description": f.description,
                    "bbox": f.bbox,
                }
                for f in self.figures
            ],
            "metadata": self.metadata,
        }


class PDFStructureExtractor:
    """
    Extracts structured content from PDF documents.

    Provides page-by-page extraction with position tracking,
    TOC detection, section boundaries, and figure detection.
    """

    # Patterns for detecting document structure
    CHAPTER_PATTERNS = [
        re.compile(r"^(?:Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)[\.:]\s*(.+)$", re.MULTILINE | re.IGNORECASE),
        re.compile(r"^(\d+)\.\s+([A-Z][^.]+)$", re.MULTILINE),  # "1. Introduction"
        re.compile(r"^Part\s+(\d+|[IVXLCDM]+)[\.:]\s*(.+)$", re.MULTILINE | re.IGNORECASE),
    ]

    SECTION_PATTERNS = [
        re.compile(r"^(\d+\.\d+)\s+(.+)$", re.MULTILINE),  # "1.1 Section Title"
        re.compile(r"^(\d+\.\d+\.\d+)\s+(.+)$", re.MULTILINE),  # "1.1.1 Subsection"
        re.compile(r"^Section\s+(\d+)[\.:]\s*(.+)$", re.MULTILINE | re.IGNORECASE),
    ]

    FIGURE_PATTERNS = [
        # Standard figure references
        re.compile(r"(?:Figure|Fig\.?|FIGURE)\s+(\d+(?:\.\d+)?)[:\.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
        re.compile(r"(?:Diagram|DIAGRAM)\s+(\d+(?:\.\d+)?)[:\.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
        re.compile(r"(?:Table|TABLE)\s+(\d+(?:\.\d+)?)[:\.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
        re.compile(r"(?:Chart|CHART)\s+(\d+(?:\.\d+)?)[:\.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
        re.compile(r"(?:Illustration|ILLUSTRATION)\s+(\d+(?:\.\d+)?)[:\.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
        re.compile(r"(?:Panel|PANEL)\s+([A-Z])[:\.]?\s*(.+?)(?:\n|$)", re.IGNORECASE),
    ]

    # Medical textbook diagram detection patterns (detect pages with diagrams)
    MEDICAL_DIAGRAM_PATTERNS = [
        # Lettered diagram references (A, B, C as standalone labels)
        re.compile(r"(?:^|\n)([A-Z])\n[A-Z]{2,3}\n", re.MULTILINE),  # A\nRV\n or similar
        # Heart sound notations (indicate cardiac diagrams)
        re.compile(r"S[1234]\s*S[1234]|S1\s+S2", re.IGNORECASE),
        # ECG-related patterns
        re.compile(r"(?:QRS|P wave|T wave|PR interval|QT interval)", re.IGNORECASE),
        # Developmental stage labels (embryology diagrams)
        re.compile(r"\d+\s*(?:days?|weeks?)\s*\d+\s*(?:days?|weeks?)", re.IGNORECASE),
        # Anatomical abbreviation clusters (suggest labeled diagrams)
        re.compile(r"(?:RV|RA|LA|LV|SVC|IVC|Ao)\s*\n\s*(?:RV|RA|LA|LV|SVC|IVC|Ao)", re.IGNORECASE),
        # Circuit/resistance notation
        re.compile(r"R[₁₂₃]|R_?[123]", re.IGNORECASE),
        # Arrow sequences in text (flow diagrams)
        re.compile(r"[→←↑↓⇒⇐]|p/uni00A0|/uni00A0p"),
        # Scattered short labels typical of diagrams
        re.compile(r"(?:^[A-Z][a-z]{1,8}\n){3,}", re.MULTILINE),  # Multiple short anatomical terms
    ]

    # Medical abbreviations to avoid splitting sentences incorrectly
    MEDICAL_ABBREVIATIONS = {
        "Dr.",
        "Prof.",
        "Mr.",
        "Mrs.",
        "Ms.",
        "vs.",
        "etc.",
        "e.g.",
        "i.e.",
        "Fig.",
        "fig.",
        "et al.",
        "mg.",
        "mL.",
        "IV.",
        "IM.",
        "SC.",
        "PO.",
        "PRN.",
        "BID.",
        "TID.",
        "QID.",
    }

    def __init__(self):
        """Initialize the PDF structure extractor."""
        pass

    def extract(self, pdf_bytes: bytes) -> DocumentStructure:
        """
        Extract full document structure from PDF.

        Args:
            pdf_bytes: Raw PDF file content

        Returns:
            DocumentStructure with pages, TOC, sections, figures, and metadata
        """
        logger.info("Starting PDF structure extraction")

        try:
            pdf_file = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_file)

            # Extract metadata
            metadata = self._extract_metadata(reader)

            # Extract page-by-page content
            pages = self._extract_pages(reader)
            full_text = "\n\n".join(p.text for p in pages)

            # Try to extract TOC from PDF outline (bookmarks)
            toc = self._extract_toc_from_outline(reader)
            if not toc:
                # Fall back to detecting TOC from content
                toc = self._detect_toc_from_content(full_text, pages)

            # Detect sections from TOC or content patterns
            sections = self._detect_sections(full_text, pages, toc)

            # Detect figures
            figures = self._detect_figures(full_text, pages)

            # Update pages with figure information
            self._update_pages_with_figures(pages, figures)

            structure = DocumentStructure(
                total_pages=len(pages),
                pages=pages,
                toc=toc,
                sections=sections,
                figures=figures,
                full_text=full_text,
                metadata=metadata,
            )

            logger.info(
                f"PDF extraction complete: {len(pages)} pages, {len(toc)} TOC entries, "
                f"{len(sections)} sections, {len(figures)} figures"
            )

            return structure

        except Exception as e:
            logger.error(f"Error extracting PDF structure: {e}", exc_info=True)
            raise ValueError(f"Failed to extract PDF structure: {e}")

    def _extract_metadata(self, reader: PdfReader) -> Dict[str, Any]:
        """Extract PDF metadata."""
        metadata = {}
        try:
            if reader.metadata:
                metadata = {
                    "title": reader.metadata.get("/Title", ""),
                    "author": reader.metadata.get("/Author", ""),
                    "subject": reader.metadata.get("/Subject", ""),
                    "creator": reader.metadata.get("/Creator", ""),
                    "producer": reader.metadata.get("/Producer", ""),
                    "creation_date": str(reader.metadata.get("/CreationDate", "")),
                    "modification_date": str(reader.metadata.get("/ModDate", "")),
                }
        except Exception as e:
            logger.warning(f"Could not extract PDF metadata: {e}")
        return metadata

    def _extract_pages(self, reader: PdfReader) -> List[PageContent]:
        """Extract text from each page with position tracking."""
        pages = []
        current_char = 0

        for page_num, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
                text = self._clean_text(text)
                word_count = len(text.split())

                pages.append(
                    PageContent(
                        page_number=page_num,
                        text=text,
                        start_char=current_char,
                        end_char=current_char + len(text),
                        word_count=word_count,
                        has_figures=False,  # Will be updated later
                        figures=[],
                    )
                )

                current_char += len(text) + 2  # +2 for \n\n separator

            except Exception as e:
                logger.warning(f"Error extracting page {page_num}: {e}")
                pages.append(
                    PageContent(
                        page_number=page_num,
                        text="",
                        start_char=current_char,
                        end_char=current_char,
                        word_count=0,
                        has_figures=False,
                        figures=[],
                    )
                )

        return pages

    def _clean_text(self, text: str) -> str:
        """Clean extracted text."""
        # Remove excessive whitespace but preserve paragraph structure
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _extract_toc_from_outline(self, reader: PdfReader) -> List[TOCEntry]:
        """Extract TOC from PDF outline/bookmarks."""
        toc = []
        try:
            outline = reader.outline
            if outline:
                self._flatten_outline(outline, toc, reader, level=1)
        except Exception as e:
            logger.debug(f"Could not extract TOC from outline: {e}")
        return toc

    def _flatten_outline(
        self,
        items: list,
        toc: List[TOCEntry],
        reader: PdfReader,
        level: int,
        page_id_map: Optional[Dict[int, int]] = None,
    ) -> None:
        """Recursively flatten PDF outline into TOC entries.

        Args:
            items: Outline items to process
            toc: List to append TOCEntry objects to
            reader: PdfReader instance
            level: Current nesting level (1 = top level)
            page_id_map: Optional pre-computed map of page object IDs to page numbers
        """
        # Build page ID map once for efficient lookup
        if page_id_map is None:
            page_id_map = {}
            for i, page in enumerate(reader.pages):
                page_id_map[id(page.indirect_reference)] = i + 1
                # Also try with the page object itself for compatibility
                page_id_map[id(page)] = i + 1

        for item in items:
            if isinstance(item, list):
                # Nested outline - increase level
                self._flatten_outline(item, toc, reader, level + 1, page_id_map)
            else:
                try:
                    title = item.title if hasattr(item, "title") else str(item)
                    page_num = self._get_page_number_from_destination(item, reader, page_id_map)

                    section_id = f"sec_{len(toc) + 1}"
                    toc.append(
                        TOCEntry(
                            title=title.strip(),
                            level=level,
                            page_number=page_num,
                            section_id=section_id,
                        )
                    )
                except Exception as e:
                    logger.debug(f"Error processing outline item: {e}")

    def _get_page_number_from_destination(
        self,
        destination,
        reader: PdfReader,
        page_id_map: Dict[int, int],
    ) -> int:
        """Extract page number from a PDF destination object.

        Handles various destination types:
        - Direct page references
        - Indirect references
        - Named destinations
        - Destination arrays [page, /Fit], [page, /XYZ, ...], etc.

        Args:
            destination: PyPDF destination object
            reader: PdfReader instance
            page_id_map: Pre-computed map of page object IDs to page numbers

        Returns:
            Page number (1-indexed), defaults to 1 if extraction fails
        """
        try:
            # Try direct page attribute first
            if hasattr(destination, "page"):
                page_obj = destination.page
                if page_obj is not None:
                    # Try indirect reference lookup
                    if hasattr(page_obj, "indirect_reference"):
                        page_id = id(page_obj.indirect_reference)
                        if page_id in page_id_map:
                            return page_id_map[page_id]

                    # Try direct object lookup
                    page_id = id(page_obj)
                    if page_id in page_id_map:
                        return page_id_map[page_id]

                    # Fallback to linear search
                    for i, page in enumerate(reader.pages):
                        if page == page_obj:
                            return i + 1
                        if hasattr(page, "indirect_reference") and hasattr(page_obj, "indirect_reference"):
                            if page.indirect_reference == page_obj.indirect_reference:
                                return i + 1

            # Try destination_array format: [page_ref, /type, ...]
            if hasattr(destination, "destination_array"):
                dest_array = destination.destination_array
                if dest_array and len(dest_array) > 0:
                    page_ref = dest_array[0]
                    if hasattr(page_ref, "get_object"):
                        page_obj = page_ref.get_object()
                        page_id = id(page_obj)
                        if page_id in page_id_map:
                            return page_id_map[page_id]

            # Try page_number attribute (some pypdf versions)
            if hasattr(destination, "page_number"):
                pn = destination.page_number
                if pn is not None:
                    return pn + 1  # Convert 0-indexed to 1-indexed

        except Exception as e:
            logger.debug(f"Error extracting page number from destination: {e}")

        return 1  # Default to page 1

    def _detect_toc_from_content(self, text: str, pages: List[PageContent]) -> List[TOCEntry]:
        """Detect TOC by analyzing content structure."""
        toc = []

        # Look for "Table of Contents" or "Contents" section in first few pages
        toc_start_patterns = [
            re.compile(r"Table\s+of\s+Contents", re.IGNORECASE),
            re.compile(r"^Contents$", re.MULTILINE | re.IGNORECASE),
        ]

        for page in pages[:10]:  # Check first 10 pages
            for pattern in toc_start_patterns:
                if pattern.search(page.text):
                    # Found TOC page - try to parse entries
                    toc_entries = self._parse_toc_page(page.text)
                    if toc_entries:
                        toc.extend(toc_entries)
                        return toc

        # If no explicit TOC, detect chapters/sections from content
        return self._detect_structure_from_content(text, pages)

    def _parse_toc_page(self, text: str) -> List[TOCEntry]:
        """Parse TOC entries from a TOC page."""
        entries = []
        # Pattern: "Chapter Title ......... 42" or "1.2 Section Name ... 15"
        toc_line_pattern = re.compile(r"^(.+?)\s*[\.·\-_]{2,}\s*(\d+)\s*$", re.MULTILINE)

        for match in toc_line_pattern.finditer(text):
            title = match.group(1).strip()
            page_num = int(match.group(2))

            # Determine level based on title format
            level = 1
            if re.match(r"^\d+\.\d+\.", title):
                level = 3
            elif re.match(r"^\d+\.\d+", title):
                level = 2
            elif re.match(r"^\d+\.", title) or title.upper().startswith("CHAPTER"):
                level = 1

            section_id = f"sec_{len(entries) + 1}"
            entries.append(
                TOCEntry(
                    title=title,
                    level=level,
                    page_number=page_num,
                    section_id=section_id,
                )
            )

        return entries

    def _detect_structure_from_content(self, text: str, pages: List[PageContent]) -> List[TOCEntry]:
        """Detect chapters and sections from content patterns."""
        toc = []

        # Find chapters
        for pattern in self.CHAPTER_PATTERNS:
            for match in pattern.finditer(text):
                title = match.group(0).strip()
                # Find which page this is on
                char_pos = match.start()
                page_num = self._char_pos_to_page(char_pos, pages)

                section_id = f"sec_{len(toc) + 1}"
                toc.append(
                    TOCEntry(
                        title=title[:200],  # Limit title length
                        level=1,
                        page_number=page_num,
                        section_id=section_id,
                    )
                )

        # Find sections (level 2)
        for pattern in self.SECTION_PATTERNS:
            for match in pattern.finditer(text):
                title = match.group(0).strip()
                char_pos = match.start()
                page_num = self._char_pos_to_page(char_pos, pages)

                # Determine level from pattern
                level = 2
                if re.match(r"^\d+\.\d+\.\d+", title):
                    level = 3

                section_id = f"sec_{len(toc) + 1}"
                toc.append(
                    TOCEntry(
                        title=title[:200],
                        level=level,
                        page_number=page_num,
                        section_id=section_id,
                    )
                )

        # Sort by page number
        toc.sort(key=lambda x: (x.page_number, x.level))
        return toc

    def _char_pos_to_page(self, char_pos: int, pages: List[PageContent]) -> int:
        """Convert character position to page number."""
        for page in pages:
            if page.start_char <= char_pos < page.end_char:
                return page.page_number
        return 1

    def _detect_sections(
        self, text: str, pages: List[PageContent], toc: List[TOCEntry]
    ) -> List[Section]:
        """Detect section boundaries from TOC and content."""
        sections = []

        if not toc:
            return sections

        # Convert TOC entries to sections with boundaries
        for i, entry in enumerate(toc):
            # Find end page (start of next section or end of document)
            if i + 1 < len(toc):
                end_page = toc[i + 1].page_number - 1
                if end_page < entry.page_number:
                    end_page = entry.page_number
            else:
                end_page = len(pages)

            # Find character boundaries
            start_char = 0
            end_char = len(text)

            for page in pages:
                if page.page_number == entry.page_number:
                    start_char = page.start_char
                if page.page_number == end_page:
                    end_char = page.end_char

            # Find parent section (previous entry with lower level)
            parent_id = None
            for j in range(i - 1, -1, -1):
                if toc[j].level < entry.level:
                    parent_id = toc[j].section_id
                    break

            sections.append(
                Section(
                    section_id=entry.section_id,
                    title=entry.title,
                    level=entry.level,
                    start_page=entry.page_number,
                    end_page=end_page,
                    start_char=start_char,
                    end_char=end_char,
                    parent_section_id=parent_id,
                )
            )

        return sections

    def _detect_figures(self, text: str, pages: List[PageContent]) -> List[Figure]:
        """Detect figures, diagrams, and tables in the document."""
        figures = []
        seen_ids = set()

        # Detect standard labeled figures
        for pattern in self.FIGURE_PATTERNS:
            for match in pattern.finditer(text):
                fig_num = match.group(1)
                caption = match.group(2).strip()

                # Create unique figure ID
                fig_id = f"fig_{fig_num}"
                if fig_id in seen_ids:
                    continue
                seen_ids.add(fig_id)

                # Find page number
                char_pos = match.start()
                page_num = self._char_pos_to_page(char_pos, pages)

                figures.append(
                    Figure(
                        figure_id=fig_id,
                        page_number=page_num,
                        caption=caption[:500],  # Limit caption length
                        description=None,  # Will be filled by GPT-4 Vision
                        bbox=None,
                    )
                )

        # Detect medical textbook diagrams (inline unlabeled diagrams)
        medical_figures = self._detect_medical_diagrams(pages)
        for mf in medical_figures:
            if mf.figure_id not in seen_ids:
                seen_ids.add(mf.figure_id)
                figures.append(mf)

        # Sort by page number
        figures.sort(key=lambda x: (x.page_number, x.figure_id))
        return figures

    def _detect_medical_diagrams(self, pages: List[PageContent]) -> List[Figure]:
        """
        Detect unlabeled medical diagrams common in textbooks like First Aid.

        Medical textbooks often have inline diagrams without explicit "Figure X:" labels.
        This method detects pages with diagram-like content based on:
        - Anatomical label clusters (RV, RA, LA, LV)
        - Heart sound notations (S1, S2)
        - ECG patterns
        - Developmental stage labels (22 days, 35 days)
        - Circuit/flow notation
        """
        figures = []
        diagram_counter = 0

        for page in pages:
            text = page.text
            detected_types = []

            for pattern in self.MEDICAL_DIAGRAM_PATTERNS:
                if pattern.search(text):
                    # Determine diagram type from pattern
                    pattern_str = pattern.pattern
                    if "S[1234]" in pattern_str:
                        detected_types.append("cardiac_auscultation")
                    elif "QRS" in pattern_str or "wave" in pattern_str.lower():
                        detected_types.append("ECG")
                    elif "days" in pattern_str.lower() or "weeks" in pattern_str.lower():
                        detected_types.append("developmental")
                    elif "RV|RA|LA|LV" in pattern_str:
                        detected_types.append("cardiac_anatomy")
                    elif "R[₁₂₃]" in pattern_str or "R_?" in pattern_str:
                        detected_types.append("circuit_diagram")
                    elif "→" in pattern_str or "p/uni" in pattern_str:
                        detected_types.append("flow_diagram")
                    else:
                        detected_types.append("anatomical")

            if detected_types:
                diagram_counter += 1
                # Create a descriptive caption based on detected types
                unique_types = list(set(detected_types))
                caption_parts = []
                for dt in unique_types:
                    if dt == "cardiac_auscultation":
                        caption_parts.append("Heart sounds diagram")
                    elif dt == "ECG":
                        caption_parts.append("ECG/EKG illustration")
                    elif dt == "developmental":
                        caption_parts.append("Developmental stages diagram")
                    elif dt == "cardiac_anatomy":
                        caption_parts.append("Cardiac anatomy illustration")
                    elif dt == "circuit_diagram":
                        caption_parts.append("Circuit/resistance diagram")
                    elif dt == "flow_diagram":
                        caption_parts.append("Flow/pathway diagram")
                    else:
                        caption_parts.append("Anatomical illustration")

                caption = "; ".join(caption_parts[:2])  # Limit to 2 types

                figures.append(
                    Figure(
                        figure_id=f"med_diag_{page.page_number}",
                        page_number=page.page_number,
                        caption=caption,
                        description=None,
                        bbox=None,
                    )
                )

        logger.info(f"Detected {len(figures)} medical textbook diagrams")
        return figures

    def _update_pages_with_figures(self, pages: List[PageContent], figures: List[Figure]) -> None:
        """Update page objects with figure information."""
        for figure in figures:
            for page in pages:
                if page.page_number == figure.page_number:
                    page.has_figures = True
                    page.figures.append(
                        {
                            "figure_id": figure.figure_id,
                            "caption": figure.caption,
                        }
                    )
                    break

    # Public helper methods for navigation

    def get_page_content(self, structure: DocumentStructure, page_number: int) -> Optional[str]:
        """Get content of a specific page."""
        for page in structure.pages:
            if page.page_number == page_number:
                return page.text
        return None

    def get_section_content(
        self, structure: DocumentStructure, section_id: str
    ) -> Optional[Tuple[str, Section]]:
        """Get content of a specific section."""
        for section in structure.sections:
            if section.section_id == section_id:
                # Extract content from full text
                content = structure.full_text[section.start_char : section.end_char]
                return content, section
        return None

    def get_section_by_title(
        self, structure: DocumentStructure, title_query: str
    ) -> Optional[Section]:
        """Find a section by title (fuzzy match)."""
        title_lower = title_query.lower()
        for section in structure.sections:
            if title_lower in section.title.lower():
                return section
        return None

    def get_figures_on_page(self, structure: DocumentStructure, page_number: int) -> List[Figure]:
        """Get all figures on a specific page."""
        return [f for f in structure.figures if f.page_number == page_number]
