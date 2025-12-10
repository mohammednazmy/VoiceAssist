"""
Unit tests for conversation folders functionality
"""

from uuid import uuid4

from app.models.folder import ConversationFolder


def test_conversation_folder_creation():
    """Test creating a ConversationFolder instance"""
    folder = ConversationFolder(
        id=uuid4(),
        user_id=uuid4(),
        name="Work Projects",
        color="#FF5733",
        icon="briefcase",
    )

    assert folder.name == "Work Projects"
    assert folder.color == "#FF5733"
    assert folder.icon == "briefcase"
    assert folder.parent_folder_id is None


def test_conversation_folder_with_parent():
    """Test creating a nested folder"""
    parent_id = uuid4()
    folder = ConversationFolder(
        id=uuid4(),
        user_id=uuid4(),
        name="Q1 2024",
        parent_folder_id=parent_id,
        color="#3498db",
        icon="calendar",
    )

    assert folder.name == "Q1 2024"
    assert folder.parent_folder_id == parent_id


def test_conversation_folder_to_dict():
    """Test converting ConversationFolder to dictionary"""
    folder_id = uuid4()
    user_id = uuid4()

    folder = ConversationFolder(
        id=folder_id,
        user_id=user_id,
        name="Medical Cases",
        color="#2ecc71",
        icon="medical",
    )

    result = folder.to_dict()

    assert result["id"] == str(folder_id)
    assert result["user_id"] == str(user_id)
    assert result["name"] == "Medical Cases"
    assert result["color"] == "#2ecc71"


def test_conversation_folder_minimal_data():
    """Test creating folder with minimal required data"""
    folder = ConversationFolder(id=uuid4(), user_id=uuid4(), name="General")

    assert folder.name == "General"
    assert folder.color is None
    assert folder.icon is None
    assert folder.parent_folder_id is None


def test_conversation_folder_hierarchy():
    """Test folder hierarchy with multiple levels"""
    user_id = uuid4()

    # Root folder
    root = ConversationFolder(id=uuid4(), user_id=user_id, name="Projects")

    # Child folder
    child = ConversationFolder(id=uuid4(), user_id=user_id, name="2024", parent_folder_id=root.id)

    # Grandchild folder
    grandchild = ConversationFolder(id=uuid4(), user_id=user_id, name="Q1", parent_folder_id=child.id)

    assert root.parent_folder_id is None
    assert child.parent_folder_id == root.id
    assert grandchild.parent_folder_id == child.id
