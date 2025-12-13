"""
Figure Description Service

Uses an OpenAI vision-capable model to generate descriptions of figures, diagrams, and images
in PDF documents. These descriptions enable voice narration of visual content.

Features:
- PDF page to image rendering
- GPT-4 Vision API integration
- Description caching to avoid repeated API calls
- Medical context-aware descriptions
"""

import base64
import hashlib
import io
import logging
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

# Try to import pdf2image, fall back gracefully if not available
try:
    from pdf2image import convert_from_bytes

    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False
    logger.warning("pdf2image not available - figure descriptions will be limited to captions")


class FigureDescriptionService:
    """
    Generates AI descriptions of figures and diagrams using GPT-4 Vision.

    This enables voice mode to describe visual content to users who
    request information about figures in their documents.
    """

    # System prompt for medical figure description
    SYSTEM_PROMPT = """You are a medical image analyst. Describe the figure or diagram
concisely but thoroughly. Focus on:
1. What type of visual it is (chart, diagram, flowchart, anatomical illustration, etc.)
2. The main subject or topic
3. Key data points, relationships, or structures shown
4. Any important labels or annotations
5. Clinical significance if apparent

Keep descriptions suitable for voice narration - avoid overly technical formatting.
Aim for 2-4 sentences that capture the essential information."""

    def __init__(
        self,
        model: Optional[str] = None,
        max_tokens: int = 500,
        cache_descriptions: bool = True,
    ):
        """
        Initialize the figure description service.

        Args:
            model: OpenAI model to use (must support vision)
            max_tokens: Maximum tokens in description
            cache_descriptions: Whether to cache descriptions in memory
        """
        self.model = model or settings.OPENAI_VISION_MODEL
        self.max_tokens = max_tokens
        self.cache_descriptions = cache_descriptions
        self._description_cache: Dict[str, str] = {}
        self._openai_client: AsyncOpenAI | None = None

        if settings.OPENAI_API_KEY:
            self._openai_client = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                timeout=float(settings.OPENAI_TIMEOUT_SEC),
            )

    async def describe_figure(
        self,
        pdf_bytes: bytes,
        page_number: int,
        figure_caption: Optional[str] = None,
        bbox: Optional[List[float]] = None,
    ) -> str:
        """
        Generate a description of a figure on a specific page.

        Args:
            pdf_bytes: Raw PDF file content
            page_number: Page number containing the figure (1-indexed)
            figure_caption: Optional caption text for context
            bbox: Optional bounding box [x1, y1, x2, y2] to crop to

        Returns:
            AI-generated description of the figure
        """
        # Generate cache key
        cache_key = self._generate_cache_key(pdf_bytes, page_number, bbox)

        # Check cache first
        if self.cache_descriptions and cache_key in self._description_cache:
            logger.debug(f"Returning cached description for page {page_number}")
            return self._description_cache[cache_key]

        try:
            # Render page to image
            image_base64 = await self._render_page_to_image(pdf_bytes, page_number, bbox)

            if not image_base64:
                # Fall back to caption if image rendering failed
                if figure_caption:
                    return f"Figure showing: {figure_caption}"
                return "Unable to generate figure description - image rendering not available."

            # Generate description using GPT-4 Vision
            description = await self._generate_description(image_base64, figure_caption)

            # Cache the result
            if self.cache_descriptions:
                self._description_cache[cache_key] = description

            return description

        except Exception as e:
            logger.error(f"Error describing figure on page {page_number}: {e}", exc_info=True)
            if figure_caption:
                return f"Figure showing: {figure_caption}"
            return "Unable to generate figure description."

    async def describe_page(
        self,
        pdf_bytes: bytes,
        page_number: int,
    ) -> str:
        """
        Generate a description of the entire page (for pages with complex visuals).

        Args:
            pdf_bytes: Raw PDF file content
            page_number: Page number (1-indexed)

        Returns:
            AI-generated description of the page's visual content
        """
        return await self.describe_figure(pdf_bytes, page_number, None, None)

    async def describe_multiple_figures(
        self,
        pdf_bytes: bytes,
        figures: List[Dict[str, Any]],
    ) -> Dict[str, str]:
        """
        Generate descriptions for multiple figures.

        Args:
            pdf_bytes: Raw PDF file content
            figures: List of figure dicts with page_number, figure_id, caption

        Returns:
            Dict mapping figure_id to description
        """
        descriptions = {}

        for figure in figures:
            page_number = figure.get("page_number", 1)
            figure_id = figure.get("figure_id", "unknown")
            caption = figure.get("caption")
            bbox = figure.get("bbox")

            try:
                description = await self.describe_figure(
                    pdf_bytes=pdf_bytes,
                    page_number=page_number,
                    figure_caption=caption,
                    bbox=bbox,
                )
                descriptions[figure_id] = description
            except Exception as e:
                logger.error(f"Error describing figure {figure_id}: {e}")
                descriptions[figure_id] = caption or "Description unavailable"

        return descriptions

    async def _render_page_to_image(
        self,
        pdf_bytes: bytes,
        page_number: int,
        bbox: Optional[List[float]] = None,
    ) -> Optional[str]:
        """
        Render a PDF page to a base64-encoded image.

        Args:
            pdf_bytes: Raw PDF content
            page_number: Page number (1-indexed)
            bbox: Optional bounding box to crop

        Returns:
            Base64-encoded JPEG image or None if rendering failed
        """
        if not PDF2IMAGE_AVAILABLE:
            logger.warning("pdf2image not available for page rendering")
            return None

        try:
            # Convert specific page to image
            images = convert_from_bytes(
                pdf_bytes,
                first_page=page_number,
                last_page=page_number,
                dpi=150,  # Balance between quality and size
                fmt="jpeg",
            )

            if not images:
                return None

            image = images[0]

            # Crop to bounding box if provided
            if bbox and len(bbox) == 4:
                width, height = image.size
                x1, y1, x2, y2 = bbox
                # Convert relative coordinates to pixels
                crop_box = (
                    int(x1 * width),
                    int(y1 * height),
                    int(x2 * width),
                    int(y2 * height),
                )
                image = image.crop(crop_box)

            # Resize if too large (GPT-4 Vision has limits)
            max_dimension = 2048
            if max(image.size) > max_dimension:
                ratio = max_dimension / max(image.size)
                new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)

            # Convert to base64
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=85)
            image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

            return image_base64

        except Exception as e:
            logger.error(f"Error rendering PDF page {page_number}: {e}", exc_info=True)
            return None

    async def _generate_description(
        self,
        image_base64: str,
        caption: Optional[str] = None,
    ) -> str:
        """
        Generate description using a vision-capable OpenAI model.

        Args:
            image_base64: Base64-encoded image
            caption: Optional caption for context

        Returns:
            AI-generated description
        """
        try:
            if self._openai_client is None:
                raise RuntimeError("OpenAI client is not configured for FigureDescriptionService")

            # Build the prompt
            user_prompt = "Describe this figure or diagram from a medical document."
            if caption:
                user_prompt += f"\n\nThe figure caption reads: \"{caption}\""

            api_params: Dict[str, Any] = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
            }

            # Newer model families use max_completion_tokens (max_tokens is rejected)
            if self.model.startswith(("gpt-4o", "gpt-5", "o1", "o3")):
                api_params["max_completion_tokens"] = self.max_tokens
            else:
                api_params["max_tokens"] = self.max_tokens

            response = await self._openai_client.chat.completions.create(**api_params)

            description = response.choices[0].message.content
            return description.strip()

        except Exception as e:
            logger.error(f"Error calling vision model for figure description: {e}", exc_info=True)
            raise

    def _generate_cache_key(
        self,
        pdf_bytes: bytes,
        page_number: int,
        bbox: Optional[List[float]] = None,
    ) -> str:
        """Generate a cache key for a figure description."""
        # Hash first 1KB of PDF + page number + bbox
        pdf_hash = hashlib.md5(pdf_bytes[:1024]).hexdigest()[:8]
        bbox_str = "_".join(str(b) for b in bbox) if bbox else "full"
        return f"{pdf_hash}_p{page_number}_{bbox_str}"

    def clear_cache(self) -> None:
        """Clear the description cache."""
        self._description_cache.clear()

    def get_cache_size(self) -> int:
        """Get the number of cached descriptions."""
        return len(self._description_cache)
