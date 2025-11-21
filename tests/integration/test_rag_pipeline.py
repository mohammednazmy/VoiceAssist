import pytest

pytestmark = pytest.mark.skip(reason="RAG integration test requires Qdrant and OpenAI configuration")

def test_rag_pipeline_placeholder():
    """Placeholder for end-to-end RAG pipeline test.

    This test is intentionally skipped by default because it requires:
    - A running Qdrant instance with the expected collection
    - Valid OpenAI API key configured for embeddings
    - Properly seeded knowledge base documents

    Once those prerequisites are met, this test should be replaced with
    a real integration test that exercises the QueryOrchestrator with
    RAG enabled.
    """
    assert True
