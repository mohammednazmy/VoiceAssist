"""
API endpoints for conversation folders
"""

from typing import Optional
from uuid import UUID

from app.core.dependencies import get_current_user
from app.core.database import get_db
from app.models.folder import ConversationFolder, FolderCreate, FolderUpdate
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/folders", status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new conversation folder.

    Args:
        folder: Folder data
        db: Database session
        current_user: Authenticated user

    Returns:
        Created folder
    """
    # Verify parent folder exists if provided
    if folder.parent_folder_id:
        parent = (
            db.query(ConversationFolder)
            .filter(
                ConversationFolder.id == UUID(folder.parent_folder_id),
                ConversationFolder.user_id == current_user.id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found"
            )

    # Check for duplicate name in same parent
    existing = (
        db.query(ConversationFolder)
        .filter(
            ConversationFolder.user_id == current_user.id,
            ConversationFolder.name == folder.name,
            ConversationFolder.parent_folder_id
            == (UUID(folder.parent_folder_id) if folder.parent_folder_id else None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder with this name already exists in this location",
        )

    # Create folder
    db_folder = ConversationFolder(
        user_id=current_user.id,
        name=folder.name,
        color=folder.color,
        icon=folder.icon,
        parent_folder_id=(
            UUID(folder.parent_folder_id) if folder.parent_folder_id else None
        ),
    )

    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)

    return db_folder.to_dict()


@router.get("/folders")
async def list_folders(
    parent_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all folders for the current user.

    Args:
        parent_id: Optional parent folder ID to filter by
        db: Database session
        current_user: Authenticated user

    Returns:
        List of folders
    """
    query = db.query(ConversationFolder).filter(
        ConversationFolder.user_id == current_user.id
    )

    if parent_id:
        query = query.filter(ConversationFolder.parent_folder_id == UUID(parent_id))
    else:
        # Get root folders (no parent)
        query = query.filter(ConversationFolder.parent_folder_id.is_(None))

    folders = query.order_by(ConversationFolder.name).all()

    return [folder.to_dict() for folder in folders]


@router.get("/folders/tree")
async def get_folder_tree(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get entire folder tree for the current user.

    Args:
        db: Database session
        current_user: Authenticated user

    Returns:
        Hierarchical folder tree
    """
    # Get all folders for user
    all_folders = (
        db.query(ConversationFolder)
        .filter(ConversationFolder.user_id == current_user.id)
        .order_by(ConversationFolder.name)
        .all()
    )

    # Build tree structure
    folder_map = {str(f.id): f.to_dict() for f in all_folders}
    for folder in folder_map.values():
        folder["children"] = []

    # Build hierarchy
    root_folders = []
    for folder in folder_map.values():
        if folder["parent_folder_id"]:
            parent = folder_map.get(folder["parent_folder_id"])
            if parent:
                parent["children"].append(folder)
        else:
            root_folders.append(folder)

    return root_folders


@router.get("/folders/{folder_id}")
async def get_folder(
    folder_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific folder by ID.

    Args:
        folder_id: Folder UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        Folder details
    """
    folder = (
        db.query(ConversationFolder)
        .filter(
            ConversationFolder.id == folder_id,
            ConversationFolder.user_id == current_user.id,
        )
        .first()
    )

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )

    return folder.to_dict()


@router.put("/folders/{folder_id}")
async def update_folder(
    folder_id: UUID,
    folder_update: FolderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a folder.

    Args:
        folder_id: Folder UUID
        folder_update: Updated folder data
        db: Database session
        current_user: Authenticated user

    Returns:
        Updated folder
    """
    folder = (
        db.query(ConversationFolder)
        .filter(
            ConversationFolder.id == folder_id,
            ConversationFolder.user_id == current_user.id,
        )
        .first()
    )

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )

    # Check for circular reference if updating parent
    if folder_update.parent_folder_id:
        parent_id = UUID(folder_update.parent_folder_id)
        if parent_id == folder_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Folder cannot be its own parent",
            )

        # Check if new parent is a descendant
        def is_descendant(current_id: UUID, target_id: UUID) -> bool:
            current = (
                db.query(ConversationFolder)
                .filter(ConversationFolder.id == current_id)
                .first()
            )
            if not current:
                return False
            if current.parent_folder_id == target_id:
                return True
            if current.parent_folder_id:
                return is_descendant(current.parent_folder_id, target_id)
            return False

        if is_descendant(parent_id, folder_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move folder into its own descendant",
            )

    # Update fields if provided
    update_data = folder_update.dict(exclude_unset=True)
    if "parent_folder_id" in update_data and update_data["parent_folder_id"]:
        update_data["parent_folder_id"] = UUID(update_data["parent_folder_id"])

    for field, value in update_data.items():
        setattr(folder, field, value)

    db.commit()
    db.refresh(folder)

    return folder.to_dict()


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a folder.
    All child folders and sessions will be orphaned (parent_folder_id = NULL).

    Args:
        folder_id: Folder UUID
        db: Database session
        current_user: Authenticated user
    """
    folder = (
        db.query(ConversationFolder)
        .filter(
            ConversationFolder.id == folder_id,
            ConversationFolder.user_id == current_user.id,
        )
        .first()
    )

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )

    # Orphan child folders (due to SET NULL on delete)
    # This happens automatically with the foreign key constraint

    db.delete(folder)
    db.commit()

    return None


@router.post("/folders/{folder_id}/move/{target_folder_id}")
async def move_folder(
    folder_id: UUID,
    target_folder_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Move a folder to a new parent folder.

    Args:
        folder_id: Folder UUID to move
        target_folder_id: New parent folder UUID
        db: Database session
        current_user: Authenticated user

    Returns:
        Updated folder
    """
    # Get folder to move
    folder = (
        db.query(ConversationFolder)
        .filter(
            ConversationFolder.id == folder_id,
            ConversationFolder.user_id == current_user.id,
        )
        .first()
    )

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )

    # Get target folder
    target = (
        db.query(ConversationFolder)
        .filter(
            ConversationFolder.id == target_folder_id,
            ConversationFolder.user_id == current_user.id,
        )
        .first()
    )

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Target folder not found"
        )

    # Check for circular reference
    if target_folder_id == folder_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot move folder into itself",
        )

    # Check if target is a descendant
    def is_descendant(current_id: UUID, target_id: UUID) -> bool:
        current = (
            db.query(ConversationFolder)
            .filter(ConversationFolder.id == current_id)
            .first()
        )
        if not current:
            return False
        if current.parent_folder_id == target_id:
            return True
        if current.parent_folder_id:
            return is_descendant(current.parent_folder_id, target_id)
        return False

    if is_descendant(target_folder_id, folder_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot move folder into its own descendant",
        )

    # Move folder
    folder.parent_folder_id = target_folder_id
    db.commit()
    db.refresh(folder)

    return folder.to_dict()
