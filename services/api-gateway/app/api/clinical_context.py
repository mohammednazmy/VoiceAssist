"""
API endpoints for clinical context management
"""

from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.clinical_context import ClinicalContext, ClinicalContextCreate, ClinicalContextUpdate
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/clinical-contexts", status_code=status.HTTP_201_CREATED)
async def create_clinical_context(
    context: ClinicalContextCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create or update clinical context for the current user.

    Args:
        context: Clinical context data
        db: Database session
        current_user: Authenticated user

    Returns:
        Clinical context record
    """
    # Check if context already exists for this user/session
    existing_context = (
        db.query(ClinicalContext)
        .filter(
            ClinicalContext.user_id == current_user.id,
            ClinicalContext.session_id
            == (UUID(context.session_id) if context.session_id else None),
        )
        .first()
    )

    if existing_context:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Clinical context already exists. Use PUT to update.",
        )

    # Create new context
    db_context = ClinicalContext(
        user_id=current_user.id,
        session_id=UUID(context.session_id) if context.session_id else None,
        age=context.age,
        gender=context.gender,
        weight_kg=context.weight_kg,
        height_cm=context.height_cm,
        chief_complaint=context.chief_complaint,
        problems=context.problems,
        medications=context.medications,
        allergies=context.allergies,
        vitals=context.vitals.dict() if context.vitals else None,
    )

    db.add(db_context)
    db.commit()
    db.refresh(db_context)

    return db_context.to_dict()


@router.get("/clinical-contexts/current")
async def get_current_clinical_context(
    session_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get clinical context for the current user.

    Args:
        session_id: Optional session ID to filter by
        db: Database session
        current_user: Authenticated user

    Returns:
        Clinical context record or None if not found
    """
    query = db.query(ClinicalContext).filter(ClinicalContext.user_id == current_user.id)

    if session_id:
        query = query.filter(ClinicalContext.session_id == UUID(session_id))
    else:
        # Get most recent context
        query = query.order_by(ClinicalContext.last_updated.desc())

    context = query.first()

    if not context:
        # Return None instead of 404 - this is not an error condition
        return None

    return context.to_dict()


@router.get("/clinical-contexts/{context_id}")
async def get_clinical_context(
    context_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific clinical context by ID.

    Args:
        context_id: Clinical context UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        Clinical context record
    """
    context = (
        db.query(ClinicalContext)
        .filter(
            ClinicalContext.id == context_id,
            ClinicalContext.user_id == current_user.id,
        )
        .first()
    )

    if not context:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Clinical context not found"
        )

    return context.to_dict()


@router.put("/clinical-contexts/{context_id}")
async def update_clinical_context(
    context_id: UUID,
    context_update: ClinicalContextUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a clinical context.

    Args:
        context_id: Clinical context UUID
        context_update: Updated clinical context data
        db: Database session
        current_user: Authenticated user

    Returns:
        Updated clinical context record
    """
    context = (
        db.query(ClinicalContext)
        .filter(
            ClinicalContext.id == context_id,
            ClinicalContext.user_id == current_user.id,
        )
        .first()
    )

    if not context:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Clinical context not found"
        )

    # Update fields if provided
    update_data = context_update.dict(exclude_unset=True)
    if "vitals" in update_data and update_data["vitals"]:
        update_data["vitals"] = update_data["vitals"].dict()

    for field, value in update_data.items():
        setattr(context, field, value)

    db.commit()
    db.refresh(context)

    return context.to_dict()


@router.delete(
    "/clinical-contexts/{context_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_clinical_context(
    context_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a clinical context.

    Args:
        context_id: Clinical context UUID
        db: Database session
        current_user: Authenticated user
    """
    context = (
        db.query(ClinicalContext)
        .filter(
            ClinicalContext.id == context_id,
            ClinicalContext.user_id == current_user.id,
        )
        .first()
    )

    if not context:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Clinical context not found"
        )

    db.delete(context)
    db.commit()

    return None
