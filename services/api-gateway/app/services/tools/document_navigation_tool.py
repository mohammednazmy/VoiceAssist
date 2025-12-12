"""
Document Navigation Tool Handlers

Provides voice-controlled document navigation for the Thinker/Talker pipeline.

Supports voice commands like:
- "I want to read Harrison's Principles"
- "Go to page 40"
- "Next page" / "Previous section"
- "What's in the table of contents?"
- "Describe the figure on this page"

Performance Optimizations:
- Document structure caching (30-minute TTL)
- Voice session caching (5-minute TTL)
- Page content caching with prefetch for adjacent pages
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tools.tool_service import ToolExecutionContext, ToolResult
from app.services.document_cache_service import document_cache

logger = logging.getLogger(__name__)


async def handle_document_select(
    arguments: Dict[str, Any],
    context: ToolExecutionContext,
) -> ToolResult:
    """
    Handle document selection for voice navigation.

    This tool helps users select a document to read from their library.
    It searches for documents matching the query and starts a session.

    Args:
        arguments:
            - query: Search term or document title
            - conversation_id: The current conversation ID
    """
    query = arguments.get("query", "")
    conversation_id = arguments.get("conversation_id")

    if not conversation_id:
        return ToolResult(
            success=False,
            data=None,
            error="Conversation ID is required to start a document session",
            error_type="ValidationError",
        )

    db: AsyncSession = context.db_session
    user_id = context.user_id

    if not db:
        return ToolResult(
            success=False,
            data=None,
            error="Database session not available",
            error_type="DatabaseError",
        )

    # Search for documents matching the query
    result = await db.execute(
        text("""
            SELECT document_id, title, total_pages, has_toc, has_figures,
                   document_structure, source_type
            FROM kb_documents
            WHERE (owner_id = :user_id OR is_public = TRUE)
              AND indexing_status = 'indexed'
              AND (title ILIKE :query OR source_type ILIKE :query)
            ORDER BY title
            LIMIT 5
        """),
        {"user_id": user_id, "query": f"%{query}%"},
    )
    documents = result.fetchall()

    if not documents:
        return ToolResult(
            success=False,
            data=None,
            message=f"I couldn't find any documents matching '{query}' in your library. Try uploading a document first or check the document name.",
            needs_clarification=True,
        )

    if len(documents) == 1:
        # Single match - start session automatically
        doc = documents[0]
        session = await _create_or_update_session(
            db, conversation_id, user_id, doc.document_id
        )

        return ToolResult(
            success=True,
            data={
                "session_id": str(session["id"]),
                "document_id": doc.document_id,
                "document_title": doc.title,
                "total_pages": doc.total_pages,
                "has_toc": doc.has_toc,
                "has_figures": doc.has_figures,
                "current_page": 1,
            },
            message=f"I've opened '{doc.title}'. It has {doc.total_pages or 'several'} pages. Would you like me to start reading from the beginning, or go to a specific page?",
        )

    # Multiple matches - ask user to clarify
    doc_list = ", ".join([f"'{d.title}'" for d in documents])
    return ToolResult(
        success=True,
        data={
            "documents": [
                {
                    "document_id": d.document_id,
                    "title": d.title,
                    "total_pages": d.total_pages,
                }
                for d in documents
            ]
        },
        message=f"I found several documents: {doc_list}. Which one would you like me to open?",
        needs_clarification=True,
    )


async def handle_document_read_page(
    arguments: Dict[str, Any],
    context: ToolExecutionContext,
) -> ToolResult:
    """
    Read content from a specific page.

    Uses caching for performance:
    - Document structure cached (30 min TTL)
    - Page content cached (15 min TTL)
    - Adjacent pages prefetched for smooth navigation

    Args:
        arguments:
            - page_number: The page number to read
            - conversation_id: The current conversation ID
    """
    page_number = arguments.get("page_number")
    conversation_id = arguments.get("conversation_id")

    if not page_number:
        return ToolResult(
            success=False,
            data=None,
            error="Please specify a page number",
            needs_clarification=True,
        )

    db: AsyncSession = context.db_session
    user_id = context.user_id

    if not db:
        return ToolResult(
            success=False,
            data=None,
            error="Database session not available",
            error_type="DatabaseError",
        )

    # Get active session (cached)
    session = await _get_active_session(db, conversation_id, user_id)
    if not session:
        return ToolResult(
            success=False,
            data=None,
            message="You don't have a document open. Would you like me to help you find one?",
            needs_clarification=True,
        )

    # Get document with structure (cached) and optional enhanced structure
    document = await _get_document_with_structure(db, session["document_id"])

    if not document or not document.get("structure"):
        return ToolResult(
            success=False,
            data=None,
            error="Document structure not available",
        )

    structure = document["structure"]
    enhanced_structure = document.get("enhanced_structure") or {}
    total_pages = document.get("total_pages") or len(structure.get("pages", []))

    # Validate page number
    if page_number < 1 or page_number > total_pages:
        return ToolResult(
            success=False,
            data=None,
            message=f"That page doesn't exist. This document has {total_pages} pages. Which page would you like?",
            needs_clarification=True,
        )

    # Try to get page from cache first (base structure)
    page_content = await document_cache.get_page_content(session["document_id"], page_number)

    if not page_content:
        # Cache miss - get from base structure
        pages = structure.get("pages", [])
        for page in pages:
            if page.get("page_number") == page_number:
                page_content = page
                # Cache this page
                await document_cache.set_page_content(session["document_id"], page_number, page)
                break

    if not page_content:
        return ToolResult(
            success=False,
            data=None,
            error=f"Could not find content for page {page_number}",
        )

    # Prefetch adjacent pages for smooth "next page" / "previous page" commands
    # Run in background to not block current response
    await document_cache.prefetch_pages(
        document_id=session["document_id"],
        structure=structure,
        current_page=page_number,
        prefetch_count=2,
    )

    # Update session position and invalidate session cache
    await db.execute(
        text("""
            UPDATE voice_document_sessions
            SET current_page = :page, updated_at = :now
            WHERE id = :session_id
        """),
        {"page": page_number, "now": datetime.now(timezone.utc), "session_id": session["id"]},
    )
    await db.commit()
    # Invalidate session cache since position changed
    await document_cache.invalidate_session(conversation_id, user_id)

    # Get figures on this page (prefer canonical structure-level figures)
    figures = structure.get("figures", [])
    page_figures = [f for f in figures if f.get("page_number") == page_number]

    # Prefer enhanced voice narration when available for reading
    enhanced_page = None
    if enhanced_structure:
        for page in enhanced_structure.get("pages", []):
            if page.get("page_number") == page_number:
                enhanced_page = page
                break

    # Default content from base structure
    content = page_content.get("text", "") or ""

    # Use enhanced voice narration as primary reading text when available
    voice_narration = ""
    if enhanced_page:
        voice_narration = enhanced_page.get("voice_narration") or ""
        # If narration is empty but we have enhanced content blocks, derive a short summary
        if not voice_narration and enhanced_page.get("content_blocks"):
            parts: list[str] = []
            for block in enhanced_page["content_blocks"]:
                if block.get("type") in ("heading", "text") and block.get("content"):
                    parts.append(block["content"])
                if len(parts) >= 3:
                    break
            if parts:
                voice_narration = " ".join(parts)

    # Choose which text to read aloud for voice, honoring reading detail when
    # requested by the pipeline:
    # - "short": use voice_narration/summary and keep it brief
    # - "full": use the fuller page text, with a safety cap
    reading_detail = getattr(context, "reading_detail", None) or "full"
    spoken_text = ""
    has_more = False

    if reading_detail == "short":
        base_text = voice_narration or content
        max_chars = 800
        spoken_text = base_text[:max_chars]
        has_more = len(base_text) > max_chars
        if has_more:
            spoken_text = spoken_text.rstrip() + "..."
    else:
        # "full" or unknown detail: prefer the full page text, but cap length
        base_text = content or voice_narration
        max_chars = 2000
        spoken_text = base_text[:max_chars]
        has_more = len(base_text) > max_chars
        if has_more:
            spoken_text = spoken_text.rstrip() + "..."

    figure_note = ""
    if page_figures:
        figure_note = f" This page contains {len(page_figures)} figure(s)."

    return ToolResult(
        success=True,
        data={
            "page_number": page_number,
            "total_pages": total_pages,
            "content": spoken_text,
            "has_figures": len(page_figures) > 0,
            "figures": page_figures,
            "has_more": has_more,
            "has_enhanced_content": bool(enhanced_page and enhanced_page.get("content_blocks")),
            "voice_narration": voice_narration,
        },
        message=f"Page {page_number} of {total_pages}.{figure_note}\n\n{spoken_text}",
    )


async def handle_document_navigate(
    arguments: Dict[str, Any],
    context: ToolExecutionContext,
) -> ToolResult:
    """
    Navigate within the document (next/previous page, section).

    Uses cached document structure for performance.

    Args:
        arguments:
            - direction: "next" or "previous"
            - target_type: "page" or "section"
            - section_name: Optional section name to navigate to
            - conversation_id: The current conversation ID
    """
    direction = arguments.get("direction", "next")
    target_type = arguments.get("target_type", "page")
    section_name = arguments.get("section_name")
    conversation_id = arguments.get("conversation_id")

    db: AsyncSession = context.db_session
    user_id = context.user_id

    if not db:
        return ToolResult(
            success=False,
            data=None,
            error="Database session not available",
            error_type="DatabaseError",
        )

    # Get active session (cached)
    session = await _get_active_session(db, conversation_id, user_id)
    if not session:
        return ToolResult(
            success=False,
            data=None,
            message="You don't have a document open. Would you like me to help you find one?",
            needs_clarification=True,
        )

    # Get document with structure (cached)
    document = await _get_document_with_structure(db, session["document_id"])

    if not document or not document.get("structure"):
        return ToolResult(
            success=False,
            data=None,
            error="Document structure not available",
        )

    structure = document["structure"]
    total_pages = document.get("total_pages") or len(structure.get("pages", []))
    current_page = session["current_page"]

    if section_name:
        # Navigate to a specific section
        sections = structure.get("sections", [])
        toc = structure.get("toc", [])

        # Search sections and TOC for matching name
        target_page = None
        for section in sections:
            if section_name.lower() in section.get("title", "").lower():
                target_page = section.get("start_page")
                break

        if not target_page:
            for entry in toc:
                if section_name.lower() in entry.get("title", "").lower():
                    target_page = entry.get("page_number")
                    break

        if target_page:
            await db.execute(
                text("""
                    UPDATE voice_document_sessions
                    SET current_page = :page, updated_at = :now
                    WHERE id = :session_id
                """),
                {"page": target_page, "now": datetime.now(timezone.utc), "session_id": session["id"]},
            )
            await db.commit()

            # Read that page
            return await handle_document_read_page(
                {"page_number": target_page, "conversation_id": conversation_id},
                context,
            )
        else:
            return ToolResult(
                success=False,
                data=None,
                message=f"I couldn't find a section called '{section_name}'. Would you like me to read the table of contents?",
                needs_clarification=True,
            )

    if target_type == "page":
        # Simple page navigation
        if direction == "next":
            new_page = min(current_page + 1, total_pages)
        else:
            new_page = max(current_page - 1, 1)

        if new_page == current_page:
            if direction == "next":
                return ToolResult(
                    success=True,
                    data={"current_page": current_page, "total_pages": total_pages},
                    message="You're at the last page of the document.",
                )
            else:
                return ToolResult(
                    success=True,
                    data={"current_page": current_page, "total_pages": total_pages},
                    message="You're at the first page of the document.",
                )

        # Read the new page
        return await handle_document_read_page(
            {"page_number": new_page, "conversation_id": conversation_id},
            context,
        )

    elif target_type == "section":
        # Section navigation
        sections = structure.get("sections", [])

        if not sections:
            return ToolResult(
                success=False,
                data=None,
                message="This document doesn't have clearly defined sections. Would you like me to navigate by page instead?",
                needs_clarification=True,
            )

        # Find current section
        current_section_idx = -1
        for i, section in enumerate(sections):
            if section.get("start_page", 0) <= current_page <= section.get("end_page", 0):
                current_section_idx = i
                break

        if direction == "next":
            new_section_idx = min(current_section_idx + 1, len(sections) - 1)
        else:
            new_section_idx = max(current_section_idx - 1, 0)

        if new_section_idx == current_section_idx:
            if direction == "next":
                return ToolResult(
                    success=True,
                    data={"current_section": sections[current_section_idx].get("title") if current_section_idx >= 0 else None},
                    message="You're in the last section of the document.",
                )
            else:
                return ToolResult(
                    success=True,
                    data={"current_section": sections[current_section_idx].get("title") if current_section_idx >= 0 else None},
                    message="You're in the first section of the document.",
                )

        new_section = sections[new_section_idx]
        new_page = new_section.get("start_page", 1)

        await db.execute(
            text("""
                UPDATE voice_document_sessions
                SET current_page = :page, current_section_id = :section_id, updated_at = :now
                WHERE id = :session_id
            """),
            {
                "page": new_page,
                "section_id": new_section.get("section_id"),
                "now": datetime.now(timezone.utc),
                "session_id": session["id"],
            },
        )
        await db.commit()

        # Read the section's first page
        result = await handle_document_read_page(
            {"page_number": new_page, "conversation_id": conversation_id},
            context,
        )

        # Add section context to message
        result.message = f"Now in section: {new_section.get('title', 'Untitled')}\n\n{result.message}"
        return result

    return ToolResult(
        success=False,
        data=None,
        error=f"Unknown target type: {target_type}",
    )


async def handle_document_toc(
    arguments: Dict[str, Any],
    context: ToolExecutionContext,
) -> ToolResult:
    """
    Get the table of contents for the active document.

    Uses cached document structure for performance.

    Args:
        arguments:
            - conversation_id: The current conversation ID
    """
    conversation_id = arguments.get("conversation_id")

    db: AsyncSession = context.db_session
    user_id = context.user_id

    if not db:
        return ToolResult(
            success=False,
            data=None,
            error="Database session not available",
            error_type="DatabaseError",
        )

    # Get active session (cached)
    session = await _get_active_session(db, conversation_id, user_id)
    if not session:
        return ToolResult(
            success=False,
            data=None,
            message="You don't have a document open. Would you like me to help you find one?",
            needs_clarification=True,
        )

    # Get document with structure (cached)
    document = await _get_document_with_structure(db, session["document_id"])

    if not document or not document.get("structure"):
        return ToolResult(
            success=False,
            data=None,
            error="Document structure not available",
        )

    structure = document["structure"]

    toc = structure.get("toc", [])

    if not toc:
        return ToolResult(
            success=True,
            data={"has_toc": False},
            message="This document doesn't have a table of contents. Would you like me to list the sections I detected?",
        )

    # Format TOC for voice
    toc_lines = []
    for entry in toc[:15]:  # Limit for voice
        indent = "  " * (entry.get("level", 1) - 1)
        title = entry.get("title", "Untitled")
        page = entry.get("page_number", "")
        toc_lines.append(f"{indent}{title} - page {page}")

    toc_text = "\n".join(toc_lines)
    has_more = len(toc) > 15

    doc_title = document.get("title", "Untitled")
    message = f"Table of Contents for '{doc_title}':\n\n{toc_text}"
    if has_more:
        message += f"\n\n...and {len(toc) - 15} more entries. Which section would you like to go to?"

    return ToolResult(
        success=True,
        data={
            "has_toc": True,
            "toc": toc[:15],
            "total_entries": len(toc),
            "document_title": doc_title,
        },
        message=message,
    )


async def handle_document_describe_figure(
    arguments: Dict[str, Any],
    context: ToolExecutionContext,
) -> ToolResult:
    """
    Describe a figure on the current page.

    Uses pre-generated GPT-4 Vision descriptions if available.
    Uses cached document structure for performance.

    Args:
        arguments:
            - page_number: Optional specific page (defaults to current)
            - figure_number: Optional specific figure on the page (defaults to first)
            - conversation_id: The current conversation ID
    """
    page_number = arguments.get("page_number")
    figure_number = arguments.get("figure_number", 1)
    conversation_id = arguments.get("conversation_id")

    db: AsyncSession = context.db_session
    user_id = context.user_id

    if not db:
        return ToolResult(
            success=False,
            data=None,
            error="Database session not available",
            error_type="DatabaseError",
        )

    # Get active session (cached)
    session = await _get_active_session(db, conversation_id, user_id)
    if not session:
        return ToolResult(
            success=False,
            data=None,
            message="You don't have a document open. Would you like me to help you find one?",
            needs_clarification=True,
        )

    # Use current page if not specified
    if page_number is None:
        page_number = session["current_page"]

    # Get document with structure (cached)
    document = await _get_document_with_structure(db, session["document_id"])

    if not document or not document.get("structure"):
        return ToolResult(
            success=False,
            data=None,
            error="Document structure not available",
        )

    structure = document["structure"]

    # Get figures on this page
    figures = structure.get("figures", [])
    page_figures = [f for f in figures if f.get("page_number") == page_number]

    if not page_figures:
        return ToolResult(
            success=True,
            data={"has_figures": False, "page_number": page_number},
            message=f"There are no figures on page {page_number}.",
        )

    # Get the requested figure
    if figure_number > len(page_figures):
        return ToolResult(
            success=True,
            data={
                "has_figures": True,
                "figure_count": len(page_figures),
                "page_number": page_number,
            },
            message=f"Page {page_number} has {len(page_figures)} figure(s). Which one would you like me to describe?",
            needs_clarification=True,
        )

    figure = page_figures[figure_number - 1]

    # Check if we have a cached description
    description = figure.get("description")
    caption = figure.get("caption", "")

    if description:
        message = f"Figure {figure_number} on page {page_number}"
        if caption:
            message += f" ({caption})"
        message += f":\n\n{description}"

        return ToolResult(
            success=True,
            data={
                "figure_id": figure.get("figure_id"),
                "page_number": page_number,
                "caption": caption,
                "description": description,
            },
            message=message,
        )

    # No cached description - use caption if available
    if caption:
        return ToolResult(
            success=True,
            data={
                "figure_id": figure.get("figure_id"),
                "page_number": page_number,
                "caption": caption,
                "description": None,
            },
            message=f"Figure {figure_number} on page {page_number}: {caption}. A detailed visual description is not available.",
        )

    return ToolResult(
        success=True,
        data={
            "figure_id": figure.get("figure_id"),
            "page_number": page_number,
        },
        message=f"There is a figure on page {page_number}, but I don't have a description available for it.",
    )


# ========== Helper Functions ==========


async def _get_document_with_structure(
    db: AsyncSession,
    document_id: str,
) -> Optional[Dict[str, Any]]:
    """Get document with structure, using cache when available.

    Caches document structure for 30 minutes to avoid repeated DB queries.
    """
    # Try cache first for structure
    cached_structure = await document_cache.get_document_structure(document_id)

    if cached_structure:
        # Still need to get metadata for title, etc.
        cached_meta = await document_cache.get_document_metadata(document_id)
        if cached_meta:
            # Fetch enhanced structure separately (not cached yet) so that
            # voice navigation can take advantage of richer page metadata
            enhanced_structure = None
            try:
                result = await db.execute(
                    text(
                        """
                        SELECT enhanced_structure
                        FROM kb_documents
                        WHERE document_id = :document_id
                        """
                    ),
                    {"document_id": document_id},
                )
                row = result.fetchone()
                if row is not None:
                    enhanced_structure = row.enhanced_structure
                    if isinstance(enhanced_structure, str):
                        enhanced_structure = json.loads(enhanced_structure)
            except Exception as e:  # pragma: no cover - defensive
                logger.warning(
                    "Failed to load enhanced_structure for document %s: %s",
                    document_id,
                    e,
                )

            return {
                "document_id": document_id,
                "title": cached_meta.get("title"),
                "total_pages": cached_meta.get("total_pages"),
                "has_toc": cached_meta.get("has_toc"),
                "has_figures": cached_meta.get("has_figures"),
                "structure": cached_structure,
                "enhanced_structure": enhanced_structure,
            }

    # Cache miss - query database for both base and enhanced structures
    result = await db.execute(
        text("""
            SELECT document_id,
                   title,
                   total_pages,
                   has_toc,
                   has_figures,
                   document_structure,
                   enhanced_structure
            FROM kb_documents
            WHERE document_id = :document_id
        """),
        {"document_id": document_id},
    )
    row = result.fetchone()

    if not row:
        return None

    structure = row.document_structure
    if isinstance(structure, str):
        structure = json.loads(structure)

    enhanced_structure = row.enhanced_structure
    if isinstance(enhanced_structure, str):
        enhanced_structure = json.loads(enhanced_structure)

    # Cache the base structure and metadata
    if structure:
        await document_cache.set_document_structure(document_id, structure)

    metadata = {
        "title": row.title,
        "total_pages": row.total_pages,
        "has_toc": row.has_toc,
        "has_figures": row.has_figures,
    }
    await document_cache.set_document_metadata(document_id, metadata)

    return {
        "document_id": document_id,
        "title": row.title,
        "total_pages": row.total_pages,
        "has_toc": row.has_toc,
        "has_figures": row.has_figures,
        "structure": structure,
        "enhanced_structure": enhanced_structure,
    }


async def _get_active_session(
    db: AsyncSession,
    conversation_id: str,
    user_id: str,
) -> Optional[Dict[str, Any]]:
    """Get the active voice document session for a conversation.

    Uses caching for performance - sessions are cached for 5 minutes.
    """
    # Try cache first
    cached_session = await document_cache.get_active_session(conversation_id, user_id)
    if cached_session:
        return cached_session

    # Cache miss - query database
    result = await db.execute(
        text("""
            SELECT id, conversation_id, user_id, document_id, current_page,
                   current_section_id, last_read_position, is_active
            FROM voice_document_sessions
            WHERE conversation_id = :conversation_id
              AND user_id = :user_id
              AND is_active = TRUE
        """),
        {"conversation_id": conversation_id, "user_id": user_id},
    )
    row = result.fetchone()
    if row:
        session = {
            "id": str(row.id),
            "conversation_id": row.conversation_id,
            "user_id": str(row.user_id),
            "document_id": row.document_id,
            "current_page": row.current_page,
            "current_section_id": row.current_section_id,
            "last_read_position": row.last_read_position,
            "is_active": row.is_active,
        }
        # Cache the session
        await document_cache.set_active_session(conversation_id, user_id, session)
        return session
    return None


async def _create_or_update_session(
    db: AsyncSession,
    conversation_id: str,
    user_id: str,
    document_id: str,
) -> Dict[str, Any]:
    """Create or update a voice document session.

    Invalidates session cache on update for consistency.
    """
    import uuid

    now = datetime.now(timezone.utc)

    # Invalidate cached session (will be re-cached with new data)
    await document_cache.invalidate_session(conversation_id, user_id)

    # Check for existing session (fresh from DB since we invalidated cache)
    result = await db.execute(
        text("""
            SELECT id FROM voice_document_sessions
            WHERE conversation_id = :conversation_id
              AND user_id = :user_id
              AND is_active = TRUE
        """),
        {"conversation_id": conversation_id, "user_id": user_id},
    )
    existing = result.fetchone()

    if existing:
        # Update existing
        await db.execute(
            text("""
                UPDATE voice_document_sessions
                SET document_id = :document_id,
                    current_page = 1,
                    current_section_id = NULL,
                    last_read_position = 0,
                    updated_at = :now
                WHERE id = :session_id
            """),
            {"document_id": document_id, "now": now, "session_id": existing.id},
        )
        await db.commit()

        session = {
            "id": str(existing.id),
            "conversation_id": conversation_id,
            "user_id": user_id,
            "document_id": document_id,
            "current_page": 1,
            "current_section_id": None,
            "last_read_position": 0,
            "is_active": True,
        }
        # Cache the updated session
        await document_cache.set_active_session(conversation_id, user_id, session)
        return session
    else:
        # Create new
        new_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO voice_document_sessions
                    (id, conversation_id, user_id, document_id, current_page,
                     current_section_id, last_read_position, is_active, created_at, updated_at)
                VALUES
                    (:id, :conversation_id, :user_id, :document_id, 1,
                     NULL, 0, TRUE, :now, :now)
            """),
            {
                "id": new_id,
                "conversation_id": conversation_id,
                "user_id": user_id,
                "document_id": document_id,
                "now": now,
            },
        )
        await db.commit()

        session = {
            "id": new_id,
            "conversation_id": conversation_id,
            "user_id": user_id,
            "document_id": document_id,
            "current_page": 1,
            "current_section_id": None,
            "last_read_position": 0,
            "is_active": True,
        }
        # Cache the new session
        await document_cache.set_active_session(conversation_id, user_id, session)
        return session
