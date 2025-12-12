"""
Enhanced PDF Processor Service

Uses pdfplumber for layout-aware text extraction and table detection,
plus pdf2image for page rendering. Provides much better extraction
quality than pypdf, especially for:
- Complex layouts with columns
- Tables with proper header/row detection
- Text that appears broken due to PDF encoding

Example improvement:
- pypdf: "C ARDIO VASCU LAR" (broken)
- pdfplumber: "CARDIOVASCULAR" (correct)
"""

import base64
import io
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from PIL import Image

logger = logging.getLogger(__name__)

# Try to import pdfplumber
try:
    import pdfplumber

    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    logger.warning("pdfplumber not available - falling back to pypdf extraction")

# Try to import pdf2image
try:
    from pdf2image import convert_from_bytes

    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False
    logger.warning("pdf2image not available - page images will not be rendered")


@dataclass
class ContentBlock:
    """A single content block extracted from a page."""

    type: str  # 'text', 'heading', 'table', 'figure'
    content: Optional[str] = None  # For text/heading
    headers: Optional[List[str]] = None  # For tables
    rows: Optional[List[List[str]]] = None  # For tables
    caption: Optional[str] = None  # For tables/figures
    figure_id: Optional[str] = None  # For figures
    description: Optional[str] = None  # For figures (AI-generated)
    bbox: Optional[List[float]] = None  # Bounding box [x0, y0, x1, y1]
    style: Optional[Dict[str, Any]] = None  # Font size, is_header, etc.

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        result = {"type": self.type}
        if self.content is not None:
            result["content"] = self.content
        if self.headers is not None:
            result["headers"] = self.headers
        if self.rows is not None:
            result["rows"] = self.rows
        if self.caption is not None:
            result["caption"] = self.caption
        if self.figure_id is not None:
            result["figure_id"] = self.figure_id
        if self.description is not None:
            result["description"] = self.description
        if self.bbox is not None:
            result["bbox"] = self.bbox
        if self.style is not None:
            result["style"] = self.style
        return result


@dataclass
class PageExtraction:
    """Extraction result for a single page."""

    page_number: int
    raw_text: str
    content_blocks: List[ContentBlock] = field(default_factory=list)
    tables: List[Dict[str, Any]] = field(default_factory=list)
    word_count: int = 0
    has_figures: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "page_number": self.page_number,
            "raw_text": self.raw_text,
            "content_blocks": [b.to_dict() for b in self.content_blocks],
            "word_count": self.word_count,
            "has_figures": self.has_figures,
        }


@dataclass
class EnhancedStructure:
    """Complete enhanced document structure."""

    total_pages: int
    pages: List[Dict[str, Any]]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON storage."""
        return {
            "pages": self.pages,
            "metadata": self.metadata,
        }


class EnhancedPDFProcessor:
    """
    Enhanced PDF processor using pdfplumber for better extraction.

    Provides:
    - Layout-aware text extraction
    - Table detection with headers and rows
    - Figure detection
    - Page image rendering
    """

    # Patterns for detecting headings
    HEADING_PATTERNS = [
        re.compile(r"^(?:Chapter|CHAPTER)\s+\d+", re.IGNORECASE),
        re.compile(r"^\d+\.\d*\s+[A-Z]", re.MULTILINE),  # "1.1 Section"
        re.compile(r"^[A-Z][A-Z\s]{10,}$", re.MULTILINE),  # ALL CAPS HEADINGS
    ]

    # Patterns for detecting figure references
    FIGURE_REF_PATTERNS = [
        re.compile(r"(?:Figure|Fig\.?|FIGURE)\s+(\d+(?:\.\d+)?)", re.IGNORECASE),
        re.compile(r"(?:Table|TABLE)\s+(\d+(?:\.\d+)?)", re.IGNORECASE),
        re.compile(r"(?:Diagram|DIAGRAM)\s+(\d+(?:\.\d+)?)", re.IGNORECASE),
    ]

    def __init__(self, storage_base_path: str = "./uploads/page_images"):
        """
        Initialize the enhanced PDF processor.

        Args:
            storage_base_path: Base path for storing page images
        """
        self.storage_base_path = Path(storage_base_path)
        self.storage_base_path.mkdir(parents=True, exist_ok=True)

    def extract_with_pdfplumber(
        self,
        pdf_bytes: bytes,
        progress_callback: Optional[Callable[[int], None]] = None,
    ) -> List[PageExtraction]:
        """
        Extract text and tables from PDF using pdfplumber.

        Args:
            pdf_bytes: Raw PDF file content
            progress_callback: Optional callback for progress updates

        Returns:
            List of PageExtraction objects
        """
        if not PDFPLUMBER_AVAILABLE:
            logger.warning("pdfplumber not available, returning empty extraction")
            return []

        extractions = []

        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                total_pages = len(pdf.pages)
                logger.info(f"Extracting {total_pages} pages with pdfplumber")

                for page_num, page in enumerate(pdf.pages, start=1):
                    try:
                        extraction = self._extract_page(page, page_num)
                        extractions.append(extraction)

                        # Update progress (0-20% for extraction phase)
                        if progress_callback:
                            progress = int((page_num / total_pages) * 20)
                            progress_callback(progress)

                    except Exception as e:
                        logger.error(f"Error extracting page {page_num}: {e}")
                        extractions.append(
                            PageExtraction(
                                page_number=page_num,
                                raw_text="",
                                word_count=0,
                            )
                        )

        except Exception as e:
            logger.error(f"Error opening PDF with pdfplumber: {e}", exc_info=True)
            raise ValueError(f"Failed to extract PDF with pdfplumber: {e}")

        return extractions

    def _extract_page(self, page, page_num: int) -> PageExtraction:
        """Extract content from a single page."""
        content_blocks = []

        # Extract text with layout preservation
        raw_text = page.extract_text(
            layout=True,  # Preserve layout
            x_tolerance=3,
            y_tolerance=3,
        ) or ""

        # Clean up text
        raw_text = self._clean_text(raw_text)
        word_count = len(raw_text.split())

        # Detect and extract tables
        tables = self._extract_tables(page, page_num)
        for table in tables:
            content_blocks.append(table)

        # Detect headings and text blocks
        text_blocks = self._detect_text_blocks(raw_text, page)
        content_blocks.extend(text_blocks)

        # Check for figures
        has_figures = self._detect_figure_presence(raw_text, page)

        return PageExtraction(
            page_number=page_num,
            raw_text=raw_text,
            content_blocks=content_blocks,
            word_count=word_count,
            has_figures=has_figures,
        )

    def _clean_text(self, text: str) -> str:
        """Clean extracted text."""
        if not text:
            return ""

        # Remove excessive whitespace but preserve structure
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Fix common PDF extraction issues
        # Reconnect split words (e.g., "C ARDIO VASCU LAR" -> "CARDIOVASCULAR")
        text = re.sub(r"(?<=[A-Z])\s+(?=[A-Z]{2,})", "", text)

        return text.strip()

    def _extract_tables(self, page, page_num: int) -> List[ContentBlock]:
        """Extract tables from page using pdfplumber."""
        content_blocks = []

        try:
            tables = page.extract_tables(
                table_settings={
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "min_words_vertical": 1,
                    "min_words_horizontal": 1,
                }
            )

            if not tables:
                # Try with text-based detection
                tables = page.extract_tables(
                    table_settings={
                        "vertical_strategy": "text",
                        "horizontal_strategy": "text",
                    }
                )

            for i, table in enumerate(tables or []):
                if not table or len(table) < 2:
                    continue

                # First row as headers
                headers = [str(cell or "").strip() for cell in table[0]]

                # Skip if headers are empty
                if not any(headers):
                    continue

                # Remaining rows as data
                rows = []
                for row in table[1:]:
                    cleaned_row = [str(cell or "").strip() for cell in row]
                    if any(cleaned_row):  # Skip empty rows
                        rows.append(cleaned_row)

                if rows:
                    # Try to find caption
                    caption = self._find_table_caption(page, i)

                    content_blocks.append(
                        ContentBlock(
                            type="table",
                            headers=headers,
                            rows=rows,
                            caption=caption,
                        )
                    )
                    logger.debug(
                        f"Extracted table on page {page_num}: "
                        f"{len(headers)} columns, {len(rows)} rows"
                    )

        except Exception as e:
            logger.warning(f"Error extracting tables from page {page_num}: {e}")

        return content_blocks

    def _find_table_caption(self, page, table_index: int) -> Optional[str]:
        """Try to find caption for a table."""
        try:
            text = page.extract_text() or ""
            # Look for "Table X:" or "Table X." patterns
            matches = list(re.finditer(r"Table\s+\d+[:.]\s*([^\n]+)", text, re.IGNORECASE))
            if table_index < len(matches):
                return matches[table_index].group(1).strip()
        except Exception:
            pass
        return None

    def _detect_text_blocks(self, raw_text: str, page) -> List[ContentBlock]:
        """Detect headings and text blocks."""
        blocks = []

        if not raw_text:
            return blocks

        # Split into paragraphs
        paragraphs = raw_text.split("\n\n")

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # Check if it's a heading
            is_heading = False
            for pattern in self.HEADING_PATTERNS:
                if pattern.match(para):
                    is_heading = True
                    break

            # Also check for short ALL CAPS lines
            if not is_heading and len(para) < 100 and para.isupper():
                is_heading = True

            block_type = "heading" if is_heading else "text"
            blocks.append(
                ContentBlock(
                    type=block_type,
                    content=para,
                    style={"is_header": is_heading},
                )
            )

        return blocks

    def _detect_figure_presence(self, raw_text: str, page) -> bool:
        """Detect if page likely has figures."""
        # Check text for figure references
        for pattern in self.FIGURE_REF_PATTERNS:
            if pattern.search(raw_text):
                return True

        # Check for image objects in page
        try:
            if hasattr(page, "images") and page.images:
                return len(page.images) > 0
        except Exception:
            pass

        return False

    def render_page_images(
        self,
        pdf_bytes: bytes,
        document_id: str,
        dpi: int = 200,
        progress_callback: Optional[Callable[[int], None]] = None,
    ) -> Optional[str]:
        """
        Render all PDF pages to images and store them.

        Args:
            pdf_bytes: Raw PDF content
            document_id: Document ID for storage path
            dpi: Resolution for rendering (200 for high quality)
            progress_callback: Optional callback for progress updates

        Returns:
            Base path where images are stored, or None if failed
        """
        if not PDF2IMAGE_AVAILABLE:
            logger.warning("pdf2image not available, skipping page image rendering")
            return None

        try:
            # Create directory for this document
            doc_path = self.storage_base_path / document_id
            doc_path.mkdir(parents=True, exist_ok=True)

            # Convert PDF to images
            logger.info(f"Rendering PDF pages to images at {dpi} DPI")
            images = convert_from_bytes(
                pdf_bytes,
                dpi=dpi,
                fmt="jpeg",
                thread_count=4,  # Parallel processing
            )

            total_pages = len(images)
            logger.info(f"Rendered {total_pages} page images")

            for i, image in enumerate(images):
                page_num = i + 1
                image_path = doc_path / f"page_{page_num:04d}.jpg"

                # Resize if too large
                max_dimension = 2048
                if max(image.size) > max_dimension:
                    ratio = max_dimension / max(image.size)
                    new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                    image = image.resize(new_size, Image.Resampling.LANCZOS)

                # Save image
                image.save(image_path, "JPEG", quality=85)

                # Update progress (20-30% for image rendering phase)
                if progress_callback:
                    progress = 20 + int((page_num / total_pages) * 10)
                    progress_callback(progress)

            return str(doc_path)

        except Exception as e:
            logger.error(f"Error rendering PDF pages: {e}", exc_info=True)
            return None

    def get_page_image_path(self, document_id: str, page_number: int) -> Optional[Path]:
        """Get the path to a rendered page image."""
        image_path = self.storage_base_path / document_id / f"page_{page_number:04d}.jpg"
        if image_path.exists():
            return image_path
        return None

    def get_page_image_base64(
        self, document_id: str, page_number: int
    ) -> Optional[str]:
        """Get a page image as base64 for API use."""
        image_path = self.get_page_image_path(document_id, page_number)
        if image_path:
            with open(image_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        return None

    def render_single_page(
        self, pdf_bytes: bytes, page_number: int, dpi: int = 200
    ) -> Optional[bytes]:
        """
        Render a single page to image bytes.

        Args:
            pdf_bytes: Raw PDF content
            page_number: Page to render (1-indexed)
            dpi: Resolution

        Returns:
            JPEG image bytes or None
        """
        if not PDF2IMAGE_AVAILABLE:
            return None

        try:
            images = convert_from_bytes(
                pdf_bytes,
                first_page=page_number,
                last_page=page_number,
                dpi=dpi,
                fmt="jpeg",
            )

            if not images:
                return None

            image = images[0]

            # Resize if needed
            max_dimension = 2048
            if max(image.size) > max_dimension:
                ratio = max_dimension / max(image.size)
                new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)

            # Convert to bytes
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=85)
            return buffer.getvalue()

        except Exception as e:
            logger.error(f"Error rendering page {page_number}: {e}")
            return None


# Singleton instance
_processor = None


def get_enhanced_pdf_processor() -> EnhancedPDFProcessor:
    """Get enhanced PDF processor instance."""
    global _processor
    if _processor is None:
        upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
        _processor = EnhancedPDFProcessor(
            storage_base_path=f"{upload_dir}/page_images"
        )
    return _processor
