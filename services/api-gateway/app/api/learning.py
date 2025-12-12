"""
Learning Mode API endpoints.

Provides flashcard management, spaced repetition study sessions,
and AI-powered flashcard generation.
"""

from typing import Any, Dict, List, Optional

from app.core.database import get_db
from app.core.logging import get_logger
from app.services.auth import get_current_active_user
from app.services.learning_service import LearningService
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = get_logger(__name__)

router = APIRouter(prefix="/api/learning", tags=["learning"])


# Request/Response Models
class CreateDeckRequest(BaseModel):
    """Request to create a study deck."""

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    document_id: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: bool = False


class UpdateDeckRequest(BaseModel):
    """Request to update a deck."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    new_cards_per_day: Optional[int] = Field(None, ge=1, le=100)
    review_cards_per_day: Optional[int] = Field(None, ge=1, le=500)


class CreateFlashcardRequest(BaseModel):
    """Request to create a flashcard."""

    deck_id: str
    card_type: str = Field(..., description="basic, cloze, multiple_choice, or true_false")
    front: str = Field(..., min_length=1)
    back: str = Field(..., min_length=1)
    extra_info: Optional[str] = None
    choices: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    document_id: Optional[str] = None
    page_number: Optional[int] = None


class UpdateFlashcardRequest(BaseModel):
    """Request to update a flashcard."""

    front: Optional[str] = None
    back: Optional[str] = None
    extra_info: Optional[str] = None
    choices: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class SubmitReviewRequest(BaseModel):
    """Request to submit a card review."""

    rating: int = Field(..., ge=1, le=4, description="1=Again, 2=Hard, 3=Good, 4=Easy")
    response_time_ms: Optional[int] = None
    session_id: Optional[str] = None


class GenerateFlashcardsRequest(BaseModel):
    """Request to generate flashcards from a document."""

    document_id: str
    page_numbers: Optional[List[int]] = None
    max_cards: int = Field(20, ge=1, le=50)


class AcceptSuggestionRequest(BaseModel):
    """Request to accept a flashcard suggestion."""

    deck_id: str
    modifications: Optional[Dict[str, Any]] = None


# Helper function
def get_learning_service(db: Session = Depends(get_db)) -> LearningService:
    """Get learning service instance."""
    return LearningService(db)


# ============ Deck Endpoints ============


@router.post("/decks")
async def create_deck(
    request: CreateDeckRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create a new study deck."""
    service = LearningService(db)

    deck = service.create_deck(
        user_id=str(current_user.id),
        name=request.name,
        description=request.description,
        document_id=request.document_id,
        tags=request.tags,
        is_public=request.is_public,
    )

    return deck.to_dict()


@router.get("/decks")
async def get_decks(
    include_public: bool = Query(False, description="Include public decks"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get all decks for the current user."""
    service = LearningService(db)
    decks = service.get_user_decks(str(current_user.id), include_public)
    return [d.to_dict() for d in decks]


@router.get("/decks/{deck_id}")
async def get_deck(
    deck_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get a specific deck."""
    service = LearningService(db)
    deck = service.get_deck(deck_id, str(current_user.id))

    if not deck:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    return deck.to_dict()


@router.put("/decks/{deck_id}")
async def update_deck(
    deck_id: str,
    request: UpdateDeckRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Update a deck."""
    service = LearningService(db)

    deck = service.update_deck(
        deck_id=deck_id,
        user_id=str(current_user.id),
        name=request.name,
        description=request.description,
        tags=request.tags,
        is_public=request.is_public,
        new_cards_per_day=request.new_cards_per_day,
        review_cards_per_day=request.review_cards_per_day,
    )

    if not deck:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    return deck.to_dict()


@router.delete("/decks/{deck_id}")
async def delete_deck(
    deck_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Delete a deck."""
    service = LearningService(db)
    success = service.delete_deck(deck_id, str(current_user.id))

    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    return {"status": "deleted", "deck_id": deck_id}


@router.get("/decks/{deck_id}/stats")
async def get_deck_stats(
    deck_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get detailed statistics for a deck."""
    service = LearningService(db)

    try:
        stats = service.get_deck_stats(deck_id)
        return stats
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ============ Flashcard Endpoints ============


@router.post("/cards")
async def create_flashcard(
    request: CreateFlashcardRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create a new flashcard."""
    service = LearningService(db)

    # Verify deck ownership
    deck = service.get_deck(request.deck_id, str(current_user.id))
    if not deck or str(deck.user_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot add cards to this deck")

    try:
        card = service.create_flashcard(
            deck_id=request.deck_id,
            card_type=request.card_type,
            front=request.front,
            back=request.back,
            extra_info=request.extra_info,
            choices=request.choices,
            tags=request.tags,
            document_id=request.document_id,
            page_number=request.page_number,
        )
        return card.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/decks/{deck_id}/cards")
async def get_deck_cards(
    deck_id: str,
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get flashcards in a deck."""
    service = LearningService(db)

    # Verify access
    deck = service.get_deck(deck_id, str(current_user.id))
    if not deck:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")

    return service.get_deck_cards(deck_id, status_filter, page, page_size)


@router.get("/cards/{card_id}")
async def get_flashcard(
    card_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get a specific flashcard."""
    service = LearningService(db)
    card = service.get_flashcard(card_id)

    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    return card.to_dict()


@router.put("/cards/{card_id}")
async def update_flashcard(
    card_id: str,
    request: UpdateFlashcardRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Update a flashcard."""
    service = LearningService(db)

    card = service.update_flashcard(
        card_id=card_id,
        front=request.front,
        back=request.back,
        extra_info=request.extra_info,
        choices=request.choices,
        tags=request.tags,
    )

    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    return card.to_dict()


@router.delete("/cards/{card_id}")
async def delete_flashcard(
    card_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Delete a flashcard."""
    service = LearningService(db)
    success = service.delete_flashcard(card_id)

    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    return {"status": "deleted", "card_id": card_id}


@router.post("/cards/{card_id}/suspend")
async def suspend_flashcard(
    card_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Suspend a flashcard from review."""
    service = LearningService(db)
    card = service.suspend_flashcard(card_id)

    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    return card.to_dict()


@router.post("/cards/{card_id}/unsuspend")
async def unsuspend_flashcard(
    card_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Unsuspend a flashcard."""
    service = LearningService(db)
    card = service.unsuspend_flashcard(card_id)

    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    return card.to_dict()


# ============ Study Session Endpoints ============


@router.get("/decks/{deck_id}/study-queue")
async def get_study_queue(
    deck_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get study queue for a deck."""
    service = LearningService(db)

    try:
        queue = service.get_study_queue(str(current_user.id), deck_id)
        return queue
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/due-cards")
async def get_due_cards(
    deck_id: Optional[str] = Query(None, description="Filter to specific deck"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get cards due for review."""
    service = LearningService(db)
    cards = service.get_due_cards(str(current_user.id), deck_id, limit)
    return [c.to_study() for c in cards]


@router.post("/sessions/start")
async def start_study_session(
    deck_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Start a new study session."""
    service = LearningService(db)
    session = service.start_study_session(str(current_user.id), deck_id)
    return session.to_dict()


@router.post("/cards/{card_id}/review")
async def submit_review(
    card_id: str,
    request: SubmitReviewRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Submit a card review."""
    service = LearningService(db)

    try:
        result = service.submit_review(
            card_id=card_id,
            user_id=str(current_user.id),
            rating=request.rating,
            response_time_ms=request.response_time_ms,
            session_id=request.session_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/sessions/{session_id}/end")
async def end_study_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """End a study session."""
    service = LearningService(db)
    session = service.end_study_session(session_id)

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    return session.to_dict()


# ============ AI Generation Endpoints ============


@router.post("/generate")
async def generate_flashcards(
    request: GenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Generate flashcards from a document using AI."""
    service = LearningService(db)

    try:
        suggestions = await service.generate_flashcards_from_document(
            document_id=request.document_id,
            user_id=str(current_user.id),
            page_numbers=request.page_numbers,
            max_cards=request.max_cards,
        )

        return {
            "generated_count": len(suggestions),
            "suggestions": [s.to_dict() for s in suggestions],
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("flashcard_generation_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Flashcard generation failed: {str(e)}",
        )


@router.get("/suggestions")
async def get_pending_suggestions(
    document_id: Optional[str] = Query(None, description="Filter by document"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get pending flashcard suggestions."""
    service = LearningService(db)
    return service.get_pending_suggestions(
        str(current_user.id),
        document_id,
        page,
        page_size,
    )


@router.post("/suggestions/{suggestion_id}/accept")
async def accept_suggestion(
    suggestion_id: str,
    request: AcceptSuggestionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Accept a flashcard suggestion."""
    service = LearningService(db)

    try:
        card = service.accept_suggestion(
            suggestion_id=suggestion_id,
            user_id=str(current_user.id),
            deck_id=request.deck_id,
            modifications=request.modifications,
        )
        return card.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Reject a flashcard suggestion."""
    service = LearningService(db)
    success = service.reject_suggestion(suggestion_id, str(current_user.id))

    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found")

    return {"status": "rejected", "suggestion_id": suggestion_id}


# ============ Statistics Endpoints ============


@router.get("/stats")
async def get_user_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get comprehensive learning statistics."""
    service = LearningService(db)
    return service.get_user_stats(str(current_user.id))


@router.get("/history")
async def get_study_history(
    days: int = Query(30, ge=1, le=365, description="Days of history"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """Get study session history."""
    service = LearningService(db)
    return service.get_study_history(str(current_user.id), days)
