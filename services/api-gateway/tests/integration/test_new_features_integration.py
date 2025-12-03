"""
Integration tests for Phase 8 new features

NOTE: These tests require a 'db' fixture providing a real database session.
Currently skipped until a proper integration test database fixture is created.
"""

from uuid import uuid4

import pytest
from app.models.attachment import MessageAttachment
from app.models.citation import MessageCitation
from app.models.clinical_context import ClinicalContext
from app.models.folder import ConversationFolder
from sqlalchemy.orm import Session

pytestmark = pytest.mark.skip(
    reason="Tests require 'db' fixture - need to create integration tests conftest.py with database session fixture"
)


@pytest.mark.asyncio
async def test_clinical_context_with_rag_query(db: Session):
    """
    Test that clinical context can be created and associated with a session
    """
    user_id = uuid4()
    session_id = uuid4()

    # Create clinical context
    context = ClinicalContext(
        id=uuid4(),
        user_id=user_id,
        session_id=session_id,
        age=45,
        gender="male",
        chief_complaint="Chest pain",
        problems=["Hypertension"],
        medications=["Lisinopril 10mg"],
        allergies=["Penicillin"],
    )

    db.add(context)
    db.commit()

    # Verify context was created
    saved_context = db.query(ClinicalContext).filter(ClinicalContext.user_id == user_id).first()

    assert saved_context is not None
    assert saved_context.age == 45
    assert "Hypertension" in saved_context.problems


@pytest.mark.asyncio
async def test_message_with_attachments_and_citations(db: Session):
    """
    Test creating a message with both attachments and citations
    """
    from app.models.message import Message

    message_id = uuid4()
    session_id = uuid4()

    # Create message
    message = Message(
        id=message_id,
        session_id=session_id,
        role="assistant",
        content="Based on the attached file and research...",
    )

    db.add(message)
    db.commit()

    # Add attachment
    attachment = MessageAttachment(
        id=uuid4(),
        message_id=message_id,
        file_name="patient_chart.pdf",
        file_type="pdf",
        file_size=2048,
        file_url="https://storage.example.com/patient_chart.pdf",
        mime_type="application/pdf",
        file_metadata={"pages": 3},
    )

    db.add(attachment)

    # Add citation
    citation = MessageCitation(
        id=uuid4(),
        message_id=message_id,
        source_id="pubmed_12345",
        source_type="journal",
        title="Clinical Study on Treatment",
        authors=["Dr. Smith"],
        pmid="12345",
        relevance_score=92,
    )

    db.add(citation)
    db.commit()

    # Verify relationships
    saved_message = db.query(Message).filter(Message.id == message_id).first()
    assert saved_message is not None

    attachments = db.query(MessageAttachment).filter(MessageAttachment.message_id == message_id).all()
    assert len(attachments) == 1
    assert attachments[0].file_name == "patient_chart.pdf"

    citations = db.query(MessageCitation).filter(MessageCitation.message_id == message_id).all()
    assert len(citations) == 1
    assert citations[0].pmid == "12345"


@pytest.mark.asyncio
async def test_folder_hierarchy_with_sessions(db: Session):
    """
    Test creating folder hierarchy and organizing sessions
    """
    from app.models.session import Session as ChatSession

    user_id = uuid4()

    # Create root folder
    root_folder = ConversationFolder(id=uuid4(), user_id=user_id, name="Medical Cases", color="#3498db")

    db.add(root_folder)
    db.commit()

    # Create subfolder
    sub_folder = ConversationFolder(
        id=uuid4(),
        user_id=user_id,
        name="Cardiology",
        parent_folder_id=root_folder.id,
        color="#e74c3c",
    )

    db.add(sub_folder)
    db.commit()

    # Create session in subfolder
    session = ChatSession(
        id=uuid4(),
        user_id=user_id,
        title="Patient consultation",
        folder_id=sub_folder.id,
    )

    db.add(session)
    db.commit()

    # Verify hierarchy
    saved_folder = db.query(ConversationFolder).filter(ConversationFolder.id == sub_folder.id).first()

    assert saved_folder.parent_folder_id == root_folder.id
    assert saved_folder.name == "Cardiology"

    saved_session = db.query(ChatSession).filter(ChatSession.id == session.id).first()

    assert saved_session.folder_id == sub_folder.id


@pytest.mark.asyncio
async def test_complete_workflow(db: Session):
    """
    Test complete workflow: folder -> session -> message -> attachments + citations
    """
    from app.models.message import Message
    from app.models.session import Session as ChatSession

    user_id = uuid4()

    # 1. Create folder
    folder = ConversationFolder(id=uuid4(), user_id=user_id, name="Patient Cases 2024")
    db.add(folder)

    # 2. Create clinical context
    context = ClinicalContext(
        id=uuid4(),
        user_id=user_id,
        age=50,
        gender="female",
        problems=["Diabetes Type 2"],
    )
    db.add(context)

    # 3. Create session in folder
    session = ChatSession(id=uuid4(), user_id=user_id, title="Diabetes consultation", folder_id=folder.id)
    db.add(session)
    db.commit()

    # 4. Create message
    message = Message(
        id=uuid4(),
        session_id=session.id,
        role="assistant",
        content="Based on the clinical data and research...",
    )
    db.add(message)
    db.commit()

    # 5. Add attachment
    attachment = MessageAttachment(
        id=uuid4(),
        message_id=message.id,
        file_name="lab_results.pdf",
        file_type="pdf",
        file_size=1024,
        file_url="https://storage.example.com/lab_results.pdf",
    )
    db.add(attachment)

    # 6. Add citation
    citation = MessageCitation(
        id=uuid4(),
        message_id=message.id,
        source_id="guideline_001",
        source_type="guideline",
        title="Diabetes Management Guidelines 2024",
    )
    db.add(citation)
    db.commit()

    # Verify complete workflow
    assert folder.id is not None
    assert context.id is not None
    assert session.folder_id == folder.id
    assert message.session_id == session.id
    assert attachment.message_id == message.id
    assert citation.message_id == message.id
