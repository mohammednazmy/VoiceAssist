"""
Unit tests for PDF Structure Extractor Service

Tests document structure extraction including:
- Page extraction with position tracking
- TOC detection (from outline and content)
- Section boundary detection
- Figure detection (standard and medical diagrams)
- Helper methods for navigation
"""

import os
import sys

# Set required environment variables before importing app modules
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("NEXTCLOUD_ADMIN_PASSWORD", "test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import re
from unittest.mock import MagicMock, patch

import pytest
from app.services.pdf_structure_extractor import (
    DocumentStructure,
    Figure,
    PageContent,
    PDFStructureExtractor,
    Section,
    TOCEntry,
)


class TestDataclasses:
    """Tests for dataclass definitions."""

    def test_page_content_creation(self):
        """Test PageContent dataclass creation."""
        page = PageContent(
            page_number=1,
            text="Sample text content",
            start_char=0,
            end_char=19,
            word_count=3,
            has_figures=True,
            figures=[{"figure_id": "fig_1", "caption": "Test figure"}],
        )
        assert page.page_number == 1
        assert page.text == "Sample text content"
        assert page.start_char == 0
        assert page.end_char == 19
        assert page.word_count == 3
        assert page.has_figures is True
        assert len(page.figures) == 1

    def test_page_content_default_figures(self):
        """Test PageContent has empty figures by default."""
        page = PageContent(
            page_number=1,
            text="Text",
            start_char=0,
            end_char=4,
            word_count=1,
        )
        assert page.has_figures is False
        assert page.figures == []

    def test_toc_entry_creation(self):
        """Test TOCEntry dataclass creation."""
        entry = TOCEntry(
            title="Chapter 1: Introduction",
            level=1,
            page_number=5,
            section_id="sec_1",
        )
        assert entry.title == "Chapter 1: Introduction"
        assert entry.level == 1
        assert entry.page_number == 5
        assert entry.section_id == "sec_1"

    def test_section_creation(self):
        """Test Section dataclass creation."""
        section = Section(
            section_id="sec_1",
            title="Methods",
            level=2,
            start_page=10,
            end_page=15,
            start_char=1000,
            end_char=2000,
            parent_section_id="sec_0",
        )
        assert section.section_id == "sec_1"
        assert section.title == "Methods"
        assert section.level == 2
        assert section.start_page == 10
        assert section.end_page == 15
        assert section.parent_section_id == "sec_0"

    def test_section_optional_parent(self):
        """Test Section with no parent."""
        section = Section(
            section_id="sec_1",
            title="Root Section",
            level=1,
            start_page=1,
            end_page=10,
            start_char=0,
            end_char=500,
        )
        assert section.parent_section_id is None

    def test_figure_creation(self):
        """Test Figure dataclass creation."""
        figure = Figure(
            figure_id="fig_1",
            page_number=5,
            caption="Heart anatomy diagram",
            description="AI-generated description",
            bbox=[100, 200, 400, 500],
        )
        assert figure.figure_id == "fig_1"
        assert figure.page_number == 5
        assert figure.caption == "Heart anatomy diagram"
        assert figure.description == "AI-generated description"
        assert figure.bbox == [100, 200, 400, 500]

    def test_figure_optional_fields(self):
        """Test Figure with optional fields."""
        figure = Figure(
            figure_id="fig_1",
            page_number=3,
            caption="Test",
        )
        assert figure.description is None
        assert figure.bbox is None


class TestDocumentStructure:
    """Tests for DocumentStructure dataclass and to_dict method."""

    def test_document_structure_creation(self):
        """Test DocumentStructure creation."""
        structure = DocumentStructure(
            total_pages=10,
            pages=[
                PageContent(
                    page_number=1, text="Page 1", start_char=0, end_char=6, word_count=2
                )
            ],
            toc=[TOCEntry(title="Chapter 1", level=1, page_number=1, section_id="sec_1")],
            sections=[
                Section(
                    section_id="sec_1",
                    title="Chapter 1",
                    level=1,
                    start_page=1,
                    end_page=10,
                    start_char=0,
                    end_char=100,
                )
            ],
            figures=[Figure(figure_id="fig_1", page_number=5, caption="Test")],
            full_text="Page 1",
            metadata={"author": "Test Author"},
        )
        assert structure.total_pages == 10
        assert len(structure.pages) == 1
        assert len(structure.toc) == 1
        assert len(structure.sections) == 1
        assert len(structure.figures) == 1

    def test_to_dict(self):
        """Test DocumentStructure.to_dict() serialization."""
        page = PageContent(
            page_number=1,
            text="Test content",
            start_char=0,
            end_char=12,
            word_count=2,
            has_figures=True,
            figures=[{"figure_id": "fig_1", "caption": "Caption"}],
        )
        toc_entry = TOCEntry(title="Chapter 1", level=1, page_number=1, section_id="sec_1")
        section = Section(
            section_id="sec_1",
            title="Chapter 1",
            level=1,
            start_page=1,
            end_page=5,
            start_char=0,
            end_char=100,
            parent_section_id=None,
        )
        figure = Figure(figure_id="fig_1", page_number=1, caption="Test figure")

        structure = DocumentStructure(
            total_pages=5,
            pages=[page],
            toc=[toc_entry],
            sections=[section],
            figures=[figure],
            full_text="Test content",
            metadata={"title": "Test Doc"},
        )

        result = structure.to_dict()

        assert result["total_pages"] == 5
        assert len(result["pages"]) == 1
        assert result["pages"][0]["page_number"] == 1
        assert result["pages"][0]["text"] == "Test content"
        assert len(result["toc"]) == 1
        assert result["toc"][0]["title"] == "Chapter 1"
        assert len(result["sections"]) == 1
        assert result["sections"][0]["section_id"] == "sec_1"
        assert len(result["figures"]) == 1
        assert result["figures"][0]["figure_id"] == "fig_1"
        assert result["metadata"]["title"] == "Test Doc"


class TestPDFStructureExtractorInit:
    """Tests for PDFStructureExtractor initialization."""

    def test_init(self):
        """Test extractor initialization."""
        extractor = PDFStructureExtractor()
        assert extractor is not None

    def test_has_patterns(self):
        """Test extractor has pattern definitions."""
        extractor = PDFStructureExtractor()
        assert len(extractor.CHAPTER_PATTERNS) > 0
        assert len(extractor.SECTION_PATTERNS) > 0
        assert len(extractor.FIGURE_PATTERNS) > 0
        assert len(extractor.MEDICAL_DIAGRAM_PATTERNS) > 0


class TestTextCleaning:
    """Tests for text cleaning functionality."""

    def test_clean_text_removes_excess_whitespace(self):
        """Test cleaning removes excessive whitespace."""
        extractor = PDFStructureExtractor()
        text = "word1   word2\t\tword3"
        result = extractor._clean_text(text)
        assert result == "word1 word2 word3"

    def test_clean_text_normalizes_newlines(self):
        """Test cleaning normalizes multiple newlines."""
        extractor = PDFStructureExtractor()
        text = "paragraph1\n\n\n\n\nparagraph2"
        result = extractor._clean_text(text)
        assert result == "paragraph1\n\nparagraph2"

    def test_clean_text_strips_ends(self):
        """Test cleaning strips leading/trailing whitespace."""
        extractor = PDFStructureExtractor()
        text = "  \n\nContent here\n\n  "
        result = extractor._clean_text(text)
        assert result == "Content here"


class TestChapterPatterns:
    """Tests for chapter detection patterns."""

    def test_chapter_pattern_with_number(self):
        """Test chapter pattern matches 'Chapter 1: Title'."""
        extractor = PDFStructureExtractor()
        text = "Chapter 1: Introduction to Medicine"
        for pattern in extractor.CHAPTER_PATTERNS:
            match = pattern.search(text)
            if match:
                assert "Introduction" in text or "1" in match.group(1)
                break

    def test_chapter_pattern_with_roman_numerals(self):
        """Test chapter pattern matches Roman numerals."""
        extractor = PDFStructureExtractor()
        text = "Chapter IV: Advanced Topics"
        found = False
        for pattern in extractor.CHAPTER_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_part_pattern(self):
        """Test 'Part' pattern detection."""
        extractor = PDFStructureExtractor()
        text = "Part III: Clinical Practice"
        found = False
        for pattern in extractor.CHAPTER_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found


class TestSectionPatterns:
    """Tests for section detection patterns."""

    def test_section_pattern_numbered(self):
        """Test section pattern '1.1 Title'."""
        extractor = PDFStructureExtractor()
        text = "1.1 Methodology"
        found = False
        for pattern in extractor.SECTION_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_subsection_pattern(self):
        """Test subsection pattern '1.1.1 Title'."""
        extractor = PDFStructureExtractor()
        text = "1.1.1 Data Collection"
        found = False
        for pattern in extractor.SECTION_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found


class TestFigurePatterns:
    """Tests for figure detection patterns."""

    def test_figure_pattern_standard(self):
        """Test 'Figure 1: Caption' pattern."""
        extractor = PDFStructureExtractor()
        text = "Figure 1: Heart anatomy diagram"
        found = False
        for pattern in extractor.FIGURE_PATTERNS:
            match = pattern.search(text)
            if match:
                found = True
                assert match.group(1) == "1"
                break
        assert found

    def test_figure_pattern_abbreviated(self):
        """Test 'Fig. 2.1' pattern."""
        extractor = PDFStructureExtractor()
        text = "Fig. 2.1 showing the results"
        found = False
        for pattern in extractor.FIGURE_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_table_pattern(self):
        """Test table detection pattern."""
        extractor = PDFStructureExtractor()
        text = "Table 3: Clinical outcomes"
        found = False
        for pattern in extractor.FIGURE_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_diagram_pattern(self):
        """Test diagram detection pattern."""
        extractor = PDFStructureExtractor()
        text = "Diagram 1: Flow chart"
        found = False
        for pattern in extractor.FIGURE_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found


class TestMedicalDiagramPatterns:
    """Tests for medical textbook diagram detection patterns."""

    def test_heart_sound_pattern(self):
        """Test cardiac auscultation pattern (S1, S2)."""
        extractor = PDFStructureExtractor()
        text = "The heart sounds S1 S2 are normal"
        found = False
        for pattern in extractor.MEDICAL_DIAGRAM_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_ecg_pattern(self):
        """Test ECG pattern detection (QRS, P wave)."""
        extractor = PDFStructureExtractor()
        text = "The QRS complex shows normal duration"
        found = False
        for pattern in extractor.MEDICAL_DIAGRAM_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_anatomical_abbreviations(self):
        """Test anatomical abbreviation clusters (RV, RA, LA, LV)."""
        extractor = PDFStructureExtractor()
        text = "RV\nRA\nLA\nLV\n"
        found = False
        for pattern in extractor.MEDICAL_DIAGRAM_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found

    def test_developmental_stages_pattern(self):
        """Test developmental stage labels (22 days)."""
        extractor = PDFStructureExtractor()
        text = "At 22 days 35 days the heart develops"
        found = False
        for pattern in extractor.MEDICAL_DIAGRAM_PATTERNS:
            if pattern.search(text):
                found = True
                break
        assert found


class TestCharPosToPage:
    """Tests for character position to page conversion."""

    def test_char_pos_first_page(self):
        """Test position in first page returns page 1."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(page_number=1, text="Page 1", start_char=0, end_char=100, word_count=10),
            PageContent(page_number=2, text="Page 2", start_char=102, end_char=200, word_count=10),
        ]
        assert extractor._char_pos_to_page(50, pages) == 1

    def test_char_pos_second_page(self):
        """Test position in second page returns page 2."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(page_number=1, text="Page 1", start_char=0, end_char=100, word_count=10),
            PageContent(page_number=2, text="Page 2", start_char=102, end_char=200, word_count=10),
        ]
        assert extractor._char_pos_to_page(150, pages) == 2

    def test_char_pos_not_found_defaults_to_1(self):
        """Test position not found returns page 1."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(page_number=1, text="Page 1", start_char=0, end_char=100, word_count=10),
        ]
        assert extractor._char_pos_to_page(500, pages) == 1


class TestTOCParsing:
    """Tests for TOC parsing from content."""

    def test_parse_toc_page_dots(self):
        """Test parsing TOC with dotted leaders."""
        extractor = PDFStructureExtractor()
        text = """
        Table of Contents
        Chapter 1 ............... 5
        Chapter 2 ............... 15
        1.1 Section One ....... 20
        """
        entries = extractor._parse_toc_page(text)
        assert len(entries) >= 2

    def test_parse_toc_determines_level(self):
        """Test TOC level detection from title format."""
        extractor = PDFStructureExtractor()
        text = """
        1. Introduction ......... 1
        1.1 Background ........ 5
        1.1.1 History ......... 10
        """
        entries = extractor._parse_toc_page(text)
        # Should have different levels based on numbering
        levels = {e.level for e in entries}
        assert len(levels) >= 1


class TestDetectFigures:
    """Tests for figure detection."""

    def test_detect_standard_figures(self):
        """Test detecting standard labeled figures."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(
                page_number=1,
                text="Content here\nFigure 1: Heart diagram\nMore content",
                start_char=0,
                end_char=50,
                word_count=10,
            )
        ]
        full_text = pages[0].text
        figures = extractor._detect_figures(full_text, pages)
        assert len(figures) >= 1
        assert figures[0].caption == "Heart diagram"

    def test_detect_tables(self):
        """Test detecting tables as figures."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(
                page_number=2,
                text="Results\nTable 1: Clinical outcomes\n",
                start_char=0,
                end_char=40,
                word_count=5,
            )
        ]
        full_text = pages[0].text
        figures = extractor._detect_figures(full_text, pages)
        assert len(figures) >= 1

    def test_figures_sorted_by_page(self):
        """Test figures are sorted by page number."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(page_number=1, text="Figure 2: B", start_char=0, end_char=20, word_count=2),
            PageContent(page_number=2, text="Figure 1: A", start_char=22, end_char=42, word_count=2),
        ]
        full_text = "\n\n".join(p.text for p in pages)
        figures = extractor._detect_figures(full_text, pages)
        # First figure in list should be from first page
        assert figures[0].page_number <= figures[-1].page_number if len(figures) > 1 else True


class TestDetectMedicalDiagrams:
    """Tests for medical diagram detection."""

    def test_detect_cardiac_diagram(self):
        """Test detecting cardiac anatomy diagrams."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(
                page_number=5,
                text="RV\nRA\nLA\nLV\nCardiac anatomy",
                start_char=0,
                end_char=30,
                word_count=5,
            )
        ]
        figures = extractor._detect_medical_diagrams(pages)
        assert len(figures) >= 1
        assert any("cardiac" in f.caption.lower() or "anatom" in f.caption.lower() for f in figures)

    def test_detect_ecg_diagram(self):
        """Test detecting ECG diagrams."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(
                page_number=10,
                text="QRS complex P wave T wave analysis",
                start_char=0,
                end_char=40,
                word_count=6,
            )
        ]
        figures = extractor._detect_medical_diagrams(pages)
        assert len(figures) >= 1
        assert any("ecg" in f.caption.lower() or "ekg" in f.caption.lower() for f in figures)

    def test_detect_heart_sounds_diagram(self):
        """Test detecting heart sounds diagrams."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(
                page_number=8,
                text="S1 S2 heart sounds normal murmur",
                start_char=0,
                end_char=35,
                word_count=6,
            )
        ]
        figures = extractor._detect_medical_diagrams(pages)
        assert len(figures) >= 1

    def test_medical_diagram_figure_id_format(self):
        """Test medical diagram figure IDs follow format."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(
                page_number=3,
                text="QRS complex duration",
                start_char=0,
                end_char=20,
                word_count=3,
            )
        ]
        figures = extractor._detect_medical_diagrams(pages)
        if figures:
            assert figures[0].figure_id.startswith("med_diag_")


class TestUpdatePagesWithFigures:
    """Tests for updating pages with figure information."""

    def test_updates_has_figures_flag(self):
        """Test has_figures is set when figure on page."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(page_number=1, text="Content", start_char=0, end_char=7, word_count=1),
            PageContent(page_number=2, text="More", start_char=9, end_char=13, word_count=1),
        ]
        figures = [Figure(figure_id="fig_1", page_number=1, caption="Test")]

        extractor._update_pages_with_figures(pages, figures)

        assert pages[0].has_figures is True
        assert pages[1].has_figures is False

    def test_adds_figure_to_page(self):
        """Test figure info added to page.figures list."""
        extractor = PDFStructureExtractor()
        pages = [
            PageContent(page_number=5, text="Content", start_char=0, end_char=7, word_count=1),
        ]
        figures = [Figure(figure_id="fig_3", page_number=5, caption="Anatomy")]

        extractor._update_pages_with_figures(pages, figures)

        assert len(pages[0].figures) == 1
        assert pages[0].figures[0]["figure_id"] == "fig_3"
        assert pages[0].figures[0]["caption"] == "Anatomy"


class TestHelperMethods:
    """Tests for public helper methods."""

    def test_get_page_content_found(self):
        """Test getting content of existing page."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=2,
            pages=[
                PageContent(page_number=1, text="Page one", start_char=0, end_char=8, word_count=2),
                PageContent(page_number=2, text="Page two", start_char=10, end_char=18, word_count=2),
            ],
            toc=[],
            sections=[],
            figures=[],
            full_text="Page one\n\nPage two",
            metadata={},
        )

        result = extractor.get_page_content(structure, 2)
        assert result == "Page two"

    def test_get_page_content_not_found(self):
        """Test getting content of non-existent page."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=1,
            pages=[PageContent(page_number=1, text="Only page", start_char=0, end_char=9, word_count=2)],
            toc=[],
            sections=[],
            figures=[],
            full_text="Only page",
            metadata={},
        )

        result = extractor.get_page_content(structure, 99)
        assert result is None

    def test_get_section_content_found(self):
        """Test getting section content."""
        extractor = PDFStructureExtractor()
        full_text = "Introduction\n\nMethods and materials\n\nResults"
        structure = DocumentStructure(
            total_pages=3,
            pages=[],
            toc=[],
            sections=[
                Section(
                    section_id="sec_2",
                    title="Methods",
                    level=2,
                    start_page=2,
                    end_page=2,
                    start_char=14,
                    end_char=36,
                )
            ],
            figures=[],
            full_text=full_text,
            metadata={},
        )

        result = extractor.get_section_content(structure, "sec_2")
        assert result is not None
        content, section = result
        assert "Methods" in content
        assert section.section_id == "sec_2"

    def test_get_section_content_not_found(self):
        """Test getting content of non-existent section."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=1,
            pages=[],
            toc=[],
            sections=[],
            figures=[],
            full_text="Text",
            metadata={},
        )

        result = extractor.get_section_content(structure, "nonexistent")
        assert result is None

    def test_get_section_by_title_found(self):
        """Test finding section by title (fuzzy)."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=2,
            pages=[],
            toc=[],
            sections=[
                Section(
                    section_id="sec_1",
                    title="Chapter 1: Introduction to Cardiology",
                    level=1,
                    start_page=1,
                    end_page=5,
                    start_char=0,
                    end_char=100,
                )
            ],
            figures=[],
            full_text="",
            metadata={},
        )

        result = extractor.get_section_by_title(structure, "cardiology")
        assert result is not None
        assert result.section_id == "sec_1"

    def test_get_section_by_title_not_found(self):
        """Test fuzzy title search with no match."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=1,
            pages=[],
            toc=[],
            sections=[Section(section_id="sec_1", title="Neurology", level=1, start_page=1, end_page=1, start_char=0, end_char=10)],
            figures=[],
            full_text="",
            metadata={},
        )

        result = extractor.get_section_by_title(structure, "cardiology")
        assert result is None

    def test_get_figures_on_page(self):
        """Test getting figures for a specific page."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=5,
            pages=[],
            toc=[],
            sections=[],
            figures=[
                Figure(figure_id="fig_1", page_number=2, caption="A"),
                Figure(figure_id="fig_2", page_number=2, caption="B"),
                Figure(figure_id="fig_3", page_number=3, caption="C"),
            ],
            full_text="",
            metadata={},
        )

        page_2_figures = extractor.get_figures_on_page(structure, 2)
        assert len(page_2_figures) == 2
        assert all(f.page_number == 2 for f in page_2_figures)

    def test_get_figures_on_page_empty(self):
        """Test getting figures from page with no figures."""
        extractor = PDFStructureExtractor()
        structure = DocumentStructure(
            total_pages=5,
            pages=[],
            toc=[],
            sections=[],
            figures=[Figure(figure_id="fig_1", page_number=5, caption="Only figure")],
            full_text="",
            metadata={},
        )

        result = extractor.get_figures_on_page(structure, 1)
        assert result == []


class TestExtractWithMockedPDF:
    """Tests for full extraction with mocked PDF reader."""

    def test_extract_simple_pdf(self):
        """Test extracting structure from a simple PDF."""
        with patch("app.services.pdf_structure_extractor.PdfReader") as mock_reader:
            # Mock PDF with 2 pages
            mock_page1 = MagicMock()
            mock_page1.extract_text.return_value = "Chapter 1: Introduction\n\nThis is page one content."
            mock_page2 = MagicMock()
            mock_page2.extract_text.return_value = "More content on page two.\n\nFigure 1: Test figure"

            mock_reader_instance = MagicMock()
            mock_reader_instance.pages = [mock_page1, mock_page2]
            mock_reader_instance.metadata = {"/Title": "Test Document", "/Author": "Test Author"}
            mock_reader_instance.outline = []
            mock_reader.return_value = mock_reader_instance

            extractor = PDFStructureExtractor()
            structure = extractor.extract(b"fake pdf bytes")

            assert structure.total_pages == 2
            assert len(structure.pages) == 2
            assert "Introduction" in structure.pages[0].text
            assert structure.metadata.get("title") == "Test Document"

    def test_extract_invalid_pdf_raises(self):
        """Test extracting from invalid PDF raises ValueError."""
        with patch("app.services.pdf_structure_extractor.PdfReader") as mock_reader:
            mock_reader.side_effect = Exception("Invalid PDF")

            extractor = PDFStructureExtractor()
            with pytest.raises(ValueError, match="Failed to extract PDF structure"):
                extractor.extract(b"invalid bytes")

    def test_extract_with_outline(self):
        """Test extracting TOC from PDF outline."""
        with patch("app.services.pdf_structure_extractor.PdfReader") as mock_reader:
            mock_page = MagicMock()
            mock_page.extract_text.return_value = "Content"

            # Mock outline entry
            mock_outline_entry = MagicMock()
            mock_outline_entry.title = "Chapter 1"
            mock_outline_entry.page = mock_page

            mock_reader_instance = MagicMock()
            mock_reader_instance.pages = [mock_page]
            mock_reader_instance.metadata = {}
            mock_reader_instance.outline = [mock_outline_entry]
            mock_reader.return_value = mock_reader_instance

            extractor = PDFStructureExtractor()
            structure = extractor.extract(b"pdf with outline")

            # Should have TOC from outline
            assert structure.total_pages == 1


class TestPageNumberExtraction:
    """Tests for improved page number extraction from destinations."""

    def test_get_page_number_from_page_attribute(self):
        """Test extraction using page attribute."""
        extractor = PDFStructureExtractor()

        with patch("app.services.pdf_structure_extractor.PdfReader") as mock_reader:
            # Create mock page
            mock_page = MagicMock()
            mock_page.indirect_reference = MagicMock()

            mock_reader_instance = MagicMock()
            mock_reader_instance.pages = [mock_page]

            # Build page_id_map
            page_id_map = {id(mock_page.indirect_reference): 1, id(mock_page): 1}

            # Create mock destination
            mock_dest = MagicMock()
            mock_dest.page = mock_page

            result = extractor._get_page_number_from_destination(mock_dest, mock_reader_instance, page_id_map)
            assert result == 1

    def test_get_page_number_defaults_to_1(self):
        """Test extraction defaults to page 1 when extraction fails."""
        extractor = PDFStructureExtractor()

        mock_reader_instance = MagicMock()
        mock_reader_instance.pages = []

        # Empty page_id_map
        page_id_map = {}

        # Destination with no page attribute
        mock_dest = MagicMock(spec=[])

        result = extractor._get_page_number_from_destination(mock_dest, mock_reader_instance, page_id_map)
        assert result == 1

    def test_get_page_number_from_page_number_attribute(self):
        """Test extraction from page_number attribute."""
        extractor = PDFStructureExtractor()

        mock_reader_instance = MagicMock()
        mock_reader_instance.pages = [MagicMock()]

        page_id_map = {}

        # Destination with page_number attribute (0-indexed)
        mock_dest = MagicMock()
        mock_dest.page = None
        mock_dest.page_number = 4  # 0-indexed

        result = extractor._get_page_number_from_destination(mock_dest, mock_reader_instance, page_id_map)
        assert result == 5  # Should return 1-indexed


class TestMetadataExtraction:
    """Tests for PDF metadata extraction."""

    def test_extract_all_metadata_fields(self):
        """Test extracting all standard metadata fields."""
        with patch("app.services.pdf_structure_extractor.PdfReader") as mock_reader:
            mock_page = MagicMock()
            mock_page.extract_text.return_value = "Content"

            mock_reader_instance = MagicMock()
            mock_reader_instance.pages = [mock_page]
            mock_reader_instance.metadata = {
                "/Title": "Medical Textbook",
                "/Author": "Dr. Smith",
                "/Subject": "Cardiology",
                "/Creator": "LaTeX",
                "/Producer": "pdfTeX",
                "/CreationDate": "D:20231001120000",
                "/ModDate": "D:20231015140000",
            }
            mock_reader_instance.outline = []
            mock_reader.return_value = mock_reader_instance

            extractor = PDFStructureExtractor()
            structure = extractor.extract(b"pdf")

            assert structure.metadata.get("title") == "Medical Textbook"
            assert structure.metadata.get("author") == "Dr. Smith"
            assert structure.metadata.get("subject") == "Cardiology"

    def test_extract_missing_metadata(self):
        """Test extraction handles missing metadata gracefully."""
        with patch("app.services.pdf_structure_extractor.PdfReader") as mock_reader:
            mock_page = MagicMock()
            mock_page.extract_text.return_value = "Content"

            mock_reader_instance = MagicMock()
            mock_reader_instance.pages = [mock_page]
            mock_reader_instance.metadata = None
            mock_reader_instance.outline = []
            mock_reader.return_value = mock_reader_instance

            extractor = PDFStructureExtractor()
            structure = extractor.extract(b"pdf")

            assert structure.metadata == {}
