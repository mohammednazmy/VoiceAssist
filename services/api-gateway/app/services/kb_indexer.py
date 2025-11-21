"""
Knowledge Base Indexer Service (Phase 5 MVP)

Handles document ingestion, text extraction, chunking, embedding generation,
and storage in Qdrant vector database.

MVP Implementation:
- Simple text/PDF extraction
- Basic chunking strategy (fixed-size with overlap)
- OpenAI embeddings
- Qdrant storage

Future enhancements:
- BioGPT/PubMedBERT embeddings
- Intelligent chunking (semantic boundaries)
- Multi-format support (DOCX, HTML, etc.)
"""
import hashlib
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import logging

from pypdf import PdfReader
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import openai

logger = logging.getLogger(__name__)


@dataclass
class DocumentChunk:
    """Represents a chunk of a document with metadata."""
    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: Dict[str, Any]


@dataclass
class IndexingResult:
    """Result of document indexing operation."""
    document_id: str
    success: bool
    chunks_indexed: int
    error_message: Optional[str] = None


class KBIndexer:
    """
    Knowledge Base Indexer for document ingestion and embedding generation.

    Handles the complete pipeline from raw documents to searchable vectors in Qdrant.
    """

    def __init__(
        self,
        qdrant_url: str = "http://qdrant:6333",
        collection_name: str = "medical_kb",
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        embedding_model: str = "text-embedding-3-small"
    ):
        """
        Initialize KB Indexer.

        Args:
            qdrant_url: Qdrant server URL
            collection_name: Name of the collection to store embeddings
            chunk_size: Size of text chunks in characters
            chunk_overlap: Overlap between chunks
            embedding_model: OpenAI embedding model to use
        """
        self.qdrant_client = QdrantClient(url=qdrant_url)
        self.collection_name = collection_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.embedding_model = embedding_model

        # Ensure collection exists
        self._ensure_collection()

    def _ensure_collection(self):
        """Ensure Qdrant collection exists with correct configuration."""
        try:
            collections = self.qdrant_client.get_collections().collections
            collection_names = [c.name for c in collections]

            if self.collection_name not in collection_names:
                # Create collection with vector size for text-embedding-3-small (1536)
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=1536, distance=Distance.COSINE)
                )
                logger.info(f"Created Qdrant collection: {self.collection_name}")
            else:
                logger.info(f"Qdrant collection already exists: {self.collection_name}")
        except Exception as e:
            logger.error(f"Error ensuring Qdrant collection: {e}", exc_info=True)
            raise

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        """
        Extract text content from PDF file.

        Args:
            pdf_bytes: PDF file content as bytes

        Returns:
            Extracted text content
        """
        try:
            import io
            pdf_file = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_file)

            text_parts = []
            for page in reader.pages:
                text_parts.append(page.extract_text())

            full_text = "\n".join(text_parts)
            logger.debug(f"Extracted {len(full_text)} characters from PDF")
            return full_text

        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}", exc_info=True)
            raise ValueError(f"Failed to extract text from PDF: {e}")

    def chunk_text(self, text: str, document_id: str, metadata: Dict[str, Any]) -> List[DocumentChunk]:
        """
        Split text into overlapping chunks.

        Args:
            text: Full text content
            document_id: Unique document identifier
            metadata: Document metadata to attach to chunks

        Returns:
            List of document chunks
        """
        chunks = []
        text_length = len(text)

        for i in range(0, text_length, self.chunk_size - self.chunk_overlap):
            chunk_text = text[i:i + self.chunk_size]

            # Skip very small chunks at the end
            if len(chunk_text) < 50:
                continue

            chunk_id = str(uuid.uuid4())
            chunk = DocumentChunk(
                chunk_id=chunk_id,
                document_id=document_id,
                content=chunk_text,
                chunk_index=i // (self.chunk_size - self.chunk_overlap),
                metadata={
                    **metadata,
                    "chunk_index": i // (self.chunk_size - self.chunk_overlap),
                    "char_start": i,
                    "char_end": min(i + self.chunk_size, text_length)
                }
            )
            chunks.append(chunk)

        logger.info(f"Created {len(chunks)} chunks from document {document_id}")
        return chunks

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text using OpenAI.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        try:
            # Use OpenAI async client
            response = await openai.embeddings.create(
                model=self.embedding_model,
                input=text
            )
            embedding = response.data[0].embedding
            return embedding

        except Exception as e:
            logger.error(f"Error generating embedding: {e}", exc_info=True)
            raise

    async def index_document(
        self,
        content: str,
        document_id: str,
        title: str,
        source_type: str = "uploaded",
        metadata: Optional[Dict[str, Any]] = None
    ) -> IndexingResult:
        """
        Index a document: chunk, embed, and store in Qdrant.

        Args:
            content: Document text content
            document_id: Unique document identifier
            title: Document title
            source_type: Type of source (uploaded, guideline, journal, etc.)
            metadata: Additional metadata

        Returns:
            IndexingResult with success status and details
        """
        try:
            # Prepare metadata
            doc_metadata = {
                "document_id": document_id,
                "title": title,
                "source_type": source_type,
                "indexed_at": datetime.utcnow().isoformat(),
                **(metadata or {})
            }

            # Chunk the document
            chunks = self.chunk_text(content, document_id, doc_metadata)

            if not chunks:
                return IndexingResult(
                    document_id=document_id,
                    success=False,
                    chunks_indexed=0,
                    error_message="No chunks generated from document"
                )

            # Generate embeddings and create points for Qdrant
            points = []
            for chunk in chunks:
                # Generate embedding
                embedding = await self.generate_embedding(chunk.content)

                # Create Qdrant point
                point = PointStruct(
                    id=chunk.chunk_id,
                    vector=embedding,
                    payload={
                        "document_id": chunk.document_id,
                        "content": chunk.content,
                        "chunk_index": chunk.chunk_index,
                        **chunk.metadata
                    }
                )
                points.append(point)

            # Upload to Qdrant
            self.qdrant_client.upsert(
                collection_name=self.collection_name,
                points=points
            )

            logger.info(f"Successfully indexed document {document_id} with {len(points)} chunks")

            return IndexingResult(
                document_id=document_id,
                success=True,
                chunks_indexed=len(points)
            )

        except Exception as e:
            logger.error(f"Error indexing document {document_id}: {e}", exc_info=True)
            return IndexingResult(
                document_id=document_id,
                success=False,
                chunks_indexed=0,
                error_message=str(e)
            )

    async def index_pdf_document(
        self,
        pdf_bytes: bytes,
        document_id: str,
        title: str,
        source_type: str = "uploaded",
        metadata: Optional[Dict[str, Any]] = None
    ) -> IndexingResult:
        """
        Index a PDF document.

        Args:
            pdf_bytes: PDF file content
            document_id: Unique document identifier
            title: Document title
            source_type: Type of source
            metadata: Additional metadata

        Returns:
            IndexingResult with success status
        """
        try:
            # Extract text from PDF
            text_content = self.extract_text_from_pdf(pdf_bytes)

            # Index the extracted text
            return await self.index_document(
                content=text_content,
                document_id=document_id,
                title=title,
                source_type=source_type,
                metadata=metadata
            )

        except Exception as e:
            logger.error(f"Error indexing PDF document {document_id}: {e}", exc_info=True)
            return IndexingResult(
                document_id=document_id,
                success=False,
                chunks_indexed=0,
                error_message=f"PDF processing failed: {e}"
            )

    def delete_document(self, document_id: str) -> bool:
        """
        Delete all chunks of a document from Qdrant.

        Args:
            document_id: Document identifier

        Returns:
            True if successful
        """
        try:
            # Delete all points with matching document_id
            self.qdrant_client.delete(
                collection_name=self.collection_name,
                points_selector={
                    "filter": {
                        "must": [
                            {
                                "key": "document_id",
                                "match": {"value": document_id}
                            }
                        ]
                    }
                }
            )
            logger.info(f"Deleted document {document_id} from index")
            return True

        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}", exc_info=True)
            return False
