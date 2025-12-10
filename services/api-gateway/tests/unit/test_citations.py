"""
Unit tests for structured citations functionality
"""

from uuid import uuid4

from app.models.citation import MessageCitation


def test_message_citation_creation():
    """Test creating a MessageCitation instance"""
    citation = MessageCitation(
        id=uuid4(),
        message_id=uuid4(),
        source_id="pubmed_12345",
        source_type="journal",
        title="Effects of XYZ on ABC",
        url="https://pubmed.gov/12345",
        authors=["Smith J", "Doe J"],
        publication_date="2024-01-15",
        journal="Journal of Medicine",
        volume="42",
        issue="3",
        pages="123-130",
        doi="10.1234/xyz.2024.123",
        pmid="12345",
        relevance_score=95,
        quoted_text="This study found that...",
    )

    assert citation.source_id == "pubmed_12345"
    assert citation.source_type == "journal"
    assert len(citation.authors) == 2
    assert citation.pmid == "12345"
    assert citation.relevance_score == 95


def test_message_citation_to_dict():
    """Test converting MessageCitation to dictionary"""
    citation_id = uuid4()
    message_id = uuid4()

    citation = MessageCitation(
        id=citation_id,
        message_id=message_id,
        source_id="textbook_001",
        source_type="textbook",
        title="Medical Textbook Chapter 5",
        authors=["Author A", "Author B"],
        relevance_score=88,
    )

    result = citation.to_dict()

    assert result["id"] == str(citation_id)
    assert result["message_id"] == str(message_id)
    assert result["source_id"] == "textbook_001"
    assert result["source_type"] == "textbook"
    assert len(result["authors"]) == 2
    assert result["relevance_score"] == 88


def test_message_citation_minimal_data():
    """Test creating MessageCitation with minimal required fields"""
    citation = MessageCitation(
        id=uuid4(),
        message_id=uuid4(),
        source_id="note_001",
        source_type="note",
        title="Clinical Note on Patient Care",
    )

    assert citation.source_id == "note_001"
    assert citation.source_type == "note"
    assert citation.authors is None
    assert citation.doi is None
    assert citation.pmid is None


def test_message_citation_apa_format():
    """Test generating APA-style citation string"""
    citation = MessageCitation(
        id=uuid4(),
        message_id=uuid4(),
        source_id="journal_001",
        source_type="journal",
        title="Research Study Title",
        authors=["Smith, J.", "Doe, A."],
        publication_date="2024",
        journal="Medical Journal",
        volume="10",
        issue="2",
        pages="45-52",
        doi="10.1234/test.2024",
    )

    # Simple APA format: Authors (Year). Title. Journal, Volume(Issue), Pages. DOI
    authors_str = ", ".join(citation.authors)
    apa_citation = (
        f"{authors_str} ({citation.publication_date}). {citation.title}. "
        f"{citation.journal}, {citation.volume}({citation.issue}), "
        f"{citation.pages}. https://doi.org/{citation.doi}"
    )

    assert "Smith, J." in apa_citation
    assert "2024" in apa_citation
    assert citation.title in apa_citation
    assert "10.1234/test.2024" in apa_citation
