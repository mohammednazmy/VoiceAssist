"""
Page Analysis Service

Uses GPT-4 Vision to analyze PDF pages and extract structured content.
Provides much better extraction than text-only methods, especially for:
- Tables with complex formatting
- Figures and diagrams with descriptions
- Voice-optimized narration of page content

Cost estimation (high resolution):
- ~$0.01275 per page
- 47-page document: ~$0.60
"""

import asyncio
import base64
import io
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Try to import pdf2image
try:
    from pdf2image import convert_from_bytes

    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False
    logger.warning("pdf2image not available - page analysis will be limited")


@dataclass
class PageAnalysisResult:
    """Result of GPT-4 Vision analysis for a single page."""

    page_number: int
    content_blocks: List[Dict[str, Any]]
    voice_narration: str
    detected_errors: List[str]
    raw_response: Optional[str] = None
    analysis_cost: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "page_number": self.page_number,
            "content_blocks": self.content_blocks,
            "voice_narration": self.voice_narration,
            "detected_errors": self.detected_errors,
        }


class PageAnalysisService:
    """
    Analyzes PDF pages using GPT-4 Vision for high-quality content extraction.

    Features:
    - Structured content extraction (text, tables, figures)
    - Voice-friendly narration generation
    - Error correction (fixes OCR/extraction issues)
    - Cost tracking
    """

    # System prompt for page analysis
    ANALYSIS_SYSTEM_PROMPT = """You are a medical textbook analyzer. Your task is to analyze PDF page images
and extract structured content for a voice-based learning assistant.

IMPORTANT GUIDELINES:
1. Extract all text content accurately, correcting any obvious OCR errors
2. Identify and structure tables with proper headers and rows
3. Describe figures and diagrams in detail for voice narration
4. Generate a concise voice narration summary (2-3 sentences)
5. Use medical terminology correctly
6. Format content for clear voice reading"""

    # User prompt template for page analysis
    ANALYSIS_USER_PROMPT = """Analyze this medical textbook page and extract structured content.

Return a JSON object with this exact structure:
{
  "content_blocks": [
    {
      "type": "heading",
      "content": "The heading text"
    },
    {
      "type": "text",
      "content": "Paragraph text..."
    },
    {
      "type": "table",
      "caption": "Table caption if present",
      "headers": ["Column1", "Column2", ...],
      "rows": [["Cell1", "Cell2", ...], ...]
    },
    {
      "type": "figure",
      "figure_id": "fig_1",
      "caption": "Figure caption if present",
      "description": "Detailed description of what the figure shows, suitable for voice narration"
    }
  ],
  "voice_narration": "A 2-3 sentence summary of the key educational content on this page, suitable for voice narration.",
  "detected_errors": ["List any OCR errors you corrected, e.g., 'CARDIO VASCU LAR' -> 'CARDIOVASCULAR'"]
}

Extract ALL content from the page. For figures/diagrams, provide detailed descriptions that convey the visual information to someone listening.
Return ONLY the JSON object, no additional text."""

    # Cost per page at different detail levels
    COST_PER_PAGE_LOW = 0.00425
    COST_PER_PAGE_HIGH = 0.01275

    def __init__(
        self,
        model: str = "gpt-4o",
        detail: str = "high",
        max_tokens: int = 4096,
        max_concurrent_requests: int = 5,
    ):
        """
        Initialize the page analysis service.

        Args:
            model: OpenAI model to use (must support vision)
            detail: Image detail level ('low' or 'high')
            max_tokens: Maximum tokens in response
            max_concurrent_requests: Max concurrent API calls
        """
        self.model = model
        self.detail = detail
        self.max_tokens = max_tokens
        self.max_concurrent_requests = max_concurrent_requests
        self._semaphore = asyncio.Semaphore(max_concurrent_requests)
        self.total_cost = 0.0

        # Initialize async OpenAI client
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if openai_api_key:
            self._openai_client = AsyncOpenAI(
                api_key=openai_api_key,
                timeout=float(os.getenv("OPENAI_TIMEOUT_SEC", "60")),
            )
        else:
            self._openai_client = None
            logger.warning(
                "OPENAI_API_KEY not configured - PageAnalysisService will not function"
            )

    async def analyze_page(
        self,
        image_bytes: bytes,
        page_number: int,
        context: Optional[str] = None,
    ) -> PageAnalysisResult:
        """
        Analyze a single page image using GPT-4 Vision.

        Args:
            image_bytes: JPEG image bytes
            page_number: Page number for reference
            context: Optional context about the document

        Returns:
            PageAnalysisResult with structured content
        """
        async with self._semaphore:
            try:
                # Check if client is configured
                if self._openai_client is None:
                    raise RuntimeError("OpenAI client is not configured for PageAnalysisService")

                # Encode image to base64
                image_base64 = base64.b64encode(image_bytes).decode("utf-8")

                # Build user prompt
                user_prompt = self.ANALYSIS_USER_PROMPT
                if context:
                    user_prompt = f"Document context: {context}\n\n{user_prompt}"

                # Call GPT-4 Vision using async client
                response = await self._openai_client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": self.ANALYSIS_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": user_prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{image_base64}",
                                        "detail": self.detail,
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens=self.max_tokens,
                    response_format={"type": "json_object"},
                )

                # Parse response
                raw_content = response.choices[0].message.content
                result = self._parse_response(raw_content, page_number)

                # Track cost
                cost = self.COST_PER_PAGE_HIGH if self.detail == "high" else self.COST_PER_PAGE_LOW
                self.total_cost += cost
                result.analysis_cost = cost

                logger.debug(f"Analyzed page {page_number}, cost: ${cost:.4f}")
                return result

            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error for page {page_number}: {e}")
                return PageAnalysisResult(
                    page_number=page_number,
                    content_blocks=[],
                    voice_narration="Unable to analyze page content.",
                    detected_errors=[f"JSON parse error: {str(e)}"],
                    raw_response=raw_content if "raw_content" in dir() else None,
                )

            except Exception as e:
                logger.error(f"Error analyzing page {page_number}: {e}", exc_info=True)
                return PageAnalysisResult(
                    page_number=page_number,
                    content_blocks=[],
                    voice_narration="Unable to analyze page content.",
                    detected_errors=[f"Analysis error: {str(e)}"],
                )

    def _parse_response(self, raw_content: str, page_number: int) -> PageAnalysisResult:
        """Parse GPT-4 Vision response into structured result."""
        try:
            # Clean up response
            raw_content = raw_content.strip()

            # Handle markdown code blocks
            if raw_content.startswith("```"):
                # Remove code block markers
                raw_content = re.sub(r"```json?\n?", "", raw_content)
                raw_content = raw_content.rstrip("`")

            data = json.loads(raw_content)

            return PageAnalysisResult(
                page_number=page_number,
                content_blocks=data.get("content_blocks", []),
                voice_narration=data.get("voice_narration", ""),
                detected_errors=data.get("detected_errors", []),
                raw_response=raw_content,
            )

        except json.JSONDecodeError:
            # Try to extract what we can
            logger.warning(f"Failed to parse JSON for page {page_number}, using fallback")
            return PageAnalysisResult(
                page_number=page_number,
                content_blocks=[
                    {"type": "text", "content": raw_content}
                ],
                voice_narration="Page content extracted.",
                detected_errors=["JSON parsing failed, raw content preserved"],
                raw_response=raw_content,
            )

    async def analyze_document(
        self,
        pdf_bytes: bytes,
        document_id: str,
        progress_callback: Optional[Callable[[int], None]] = None,
    ) -> List[PageAnalysisResult]:
        """
        Analyze all pages in a PDF document.

        Args:
            pdf_bytes: Raw PDF content
            document_id: Document ID for logging
            progress_callback: Optional callback for progress updates (0-100)

        Returns:
            List of PageAnalysisResult for each page
        """
        if not PDF2IMAGE_AVAILABLE:
            logger.error("pdf2image not available, cannot analyze document")
            return []

        try:
            # Convert PDF to images
            logger.info(f"Converting PDF to images for document {document_id}")
            images = convert_from_bytes(
                pdf_bytes,
                dpi=200,  # High resolution for better analysis
                fmt="jpeg",
                thread_count=4,
            )

            total_pages = len(images)
            logger.info(f"Analyzing {total_pages} pages with GPT-4 Vision")

            results = []

            for i, image in enumerate(images):
                page_num = i + 1

                # Convert PIL image to bytes
                buffer = io.BytesIO()

                # Resize if too large
                max_dimension = 2048
                if max(image.size) > max_dimension:
                    ratio = max_dimension / max(image.size)
                    new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                    from PIL import Image
                    image = image.resize(new_size, Image.Resampling.LANCZOS)

                image.save(buffer, format="JPEG", quality=85)
                image_bytes = buffer.getvalue()

                # Analyze page
                result = await self.analyze_page(image_bytes, page_num)
                results.append(result)

                # Update progress (30-90% for analysis phase)
                if progress_callback:
                    progress = 30 + int((page_num / total_pages) * 60)
                    progress_callback(progress)

                logger.info(f"Analyzed page {page_num}/{total_pages}")

            logger.info(f"Document analysis complete. Total cost: ${self.total_cost:.2f}")
            return results

        except Exception as e:
            logger.error(f"Error analyzing document {document_id}: {e}", exc_info=True)
            raise

    async def analyze_single_page_from_pdf(
        self,
        pdf_bytes: bytes,
        page_number: int,
    ) -> PageAnalysisResult:
        """
        Analyze a single page from a PDF.

        Args:
            pdf_bytes: Raw PDF content
            page_number: Page to analyze (1-indexed)

        Returns:
            PageAnalysisResult
        """
        if not PDF2IMAGE_AVAILABLE:
            logger.error("pdf2image not available")
            return PageAnalysisResult(
                page_number=page_number,
                content_blocks=[],
                voice_narration="Unable to analyze page.",
                detected_errors=["pdf2image not available"],
            )

        try:
            # Convert specific page to image
            images = convert_from_bytes(
                pdf_bytes,
                first_page=page_number,
                last_page=page_number,
                dpi=200,
                fmt="jpeg",
            )

            if not images:
                return PageAnalysisResult(
                    page_number=page_number,
                    content_blocks=[],
                    voice_narration="Page not found.",
                    detected_errors=["Page not found in PDF"],
                )

            # Convert to bytes
            image = images[0]
            buffer = io.BytesIO()

            # Resize if needed
            max_dimension = 2048
            if max(image.size) > max_dimension:
                ratio = max_dimension / max(image.size)
                new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                from PIL import Image
                image = image.resize(new_size, Image.Resampling.LANCZOS)

            image.save(buffer, format="JPEG", quality=85)
            image_bytes = buffer.getvalue()

            return await self.analyze_page(image_bytes, page_number)

        except Exception as e:
            logger.error(f"Error analyzing page {page_number}: {e}")
            return PageAnalysisResult(
                page_number=page_number,
                content_blocks=[],
                voice_narration="Unable to analyze page.",
                detected_errors=[str(e)],
            )

    def estimate_cost(self, total_pages: int) -> float:
        """Estimate cost for analyzing a document."""
        cost_per_page = self.COST_PER_PAGE_HIGH if self.detail == "high" else self.COST_PER_PAGE_LOW
        return total_pages * cost_per_page

    def get_total_cost(self) -> float:
        """Get total cost incurred so far."""
        return self.total_cost

    def reset_cost_tracking(self) -> None:
        """Reset cost tracking."""
        self.total_cost = 0.0


# Singleton instance
_service = None


def get_page_analysis_service() -> PageAnalysisService:
    """Get page analysis service instance."""
    global _service
    if _service is None:
        _service = PageAnalysisService(
            model=os.getenv("GPT4_VISION_MODEL", "gpt-4o"),
            detail="high",  # Always use high resolution for best quality
        )
    return _service
