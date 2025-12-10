#!/usr/bin/env python3
"""
Platform Documentation Embedder

Embeds VoiceAssist platform documentation into Qdrant for AI-powered search.
Creates a dedicated 'platform_docs' collection separate from medical knowledge.

Usage:
    python scripts/embed-docs.py                    # Incremental update (skip unchanged)
    python scripts/embed-docs.py --force            # Force re-index all docs
    python scripts/embed-docs.py --dry-run          # Preview without indexing
    python scripts/embed-docs.py --collection NAME  # Custom collection name

Environment Variables:
    QDRANT_URL       - Qdrant server URL (default: http://localhost:6333)
    OPENAI_API_KEY   - OpenAI API key for embeddings
"""

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import asyncio

# Add server/app to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "server"))

import yaml

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams, Filter, FieldCondition, MatchValue
except ImportError:
    print("Error: qdrant-client not installed. Run: pip install qdrant-client")
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai not installed. Run: pip install openai")
    sys.exit(1)


# Configuration
COLLECTION_NAME = "platform_docs"
EMBEDDING_MODEL = "text-embedding-3-small"
VECTOR_SIZE = 1536
MAX_CHUNK_SIZE = 1500  # characters
CHUNK_OVERLAP = 200
BATCH_SIZE = 50  # embeddings per API call


@dataclass
class DocChunk:
    """A chunk of documentation ready for embedding."""
    chunk_id: str
    doc_path: str
    doc_title: str
    section_heading: str
    section_anchor: str
    content: str
    chunk_index: int
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DocMetadata:
    """Parsed frontmatter metadata from a document."""
    title: str = ""
    slug: str = ""
    status: str = "draft"
    summary: str = ""
    category: str = ""
    audience: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    last_updated: str = ""
    related_services: List[str] = field(default_factory=list)


class DocsEmbedder:
    """Embeds platform documentation into Qdrant for semantic search."""

    def __init__(
        self,
        qdrant_url: str,
        docs_dir: str,
        collection_name: str = COLLECTION_NAME,
        dry_run: bool = False,
    ):
        self.qdrant_url = qdrant_url
        self.docs_dir = Path(docs_dir)
        self.collection_name = collection_name
        self.dry_run = dry_run

        self.qdrant = QdrantClient(url=qdrant_url)
        self.openai = OpenAI()

        # Stats
        self.stats = {
            "files_processed": 0,
            "files_skipped": 0,
            "chunks_created": 0,
            "chunks_indexed": 0,
            "errors": 0,
        }

    def _ensure_collection(self) -> None:
        """Create collection if it doesn't exist."""
        collections = self.qdrant.get_collections().collections
        collection_names = [c.name for c in collections]

        if self.collection_name not in collection_names:
            if self.dry_run:
                print(f"  [DRY RUN] Would create collection: {self.collection_name}")
                return

            print(f"Creating collection: {self.collection_name}")
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=VECTOR_SIZE,
                    distance=Distance.COSINE,
                ),
            )
            print(f"  Created with {VECTOR_SIZE}-dim vectors, COSINE distance")
        else:
            print(f"Collection exists: {self.collection_name}")

    def parse_frontmatter(self, content: str) -> Tuple[DocMetadata, str]:
        """Extract YAML frontmatter and return metadata + body."""
        metadata = DocMetadata()
        body = content

        # Check for YAML frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try:
                    fm = yaml.safe_load(parts[1])
                    if fm:
                        metadata.title = fm.get("title", "")
                        metadata.slug = fm.get("slug", "")
                        metadata.status = fm.get("status", "draft")
                        metadata.summary = fm.get("summary", "")
                        metadata.category = fm.get("category", "")
                        metadata.last_updated = fm.get("lastUpdated", "")

                        # Handle list fields
                        audience = fm.get("audience", [])
                        metadata.audience = audience if isinstance(audience, list) else [audience] if audience else []

                        tags = fm.get("tags", [])
                        metadata.tags = tags if isinstance(tags, list) else [tags] if tags else []

                        services = fm.get("relatedServices", [])
                        metadata.related_services = services if isinstance(services, list) else [services] if services else []

                    body = parts[2].strip()
                except yaml.YAMLError:
                    pass  # Keep original content if YAML parsing fails

        return metadata, body

    def extract_sections(self, content: str, doc_title: str) -> List[Dict[str, Any]]:
        """Extract sections from markdown by heading level."""
        sections = []
        current_heading = doc_title
        current_anchor = ""
        current_content = []

        lines = content.split("\n")

        for line in lines:
            # Check for heading
            heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)

            if heading_match:
                # Save previous section if it has content
                if current_content:
                    text = "\n".join(current_content).strip()
                    if text:
                        sections.append({
                            "heading": current_heading,
                            "anchor": current_anchor,
                            "content": text,
                        })

                # Start new section
                current_heading = heading_match.group(2).strip()
                current_anchor = self._slugify(current_heading)
                current_content = []
            else:
                current_content.append(line)

        # Don't forget the last section
        if current_content:
            text = "\n".join(current_content).strip()
            if text:
                sections.append({
                    "heading": current_heading,
                    "anchor": current_anchor,
                    "content": text,
                })

        return sections

    def _slugify(self, text: str) -> str:
        """Convert text to URL-safe anchor."""
        text = text.lower()
        text = re.sub(r"[^\w\s-]", "", text)
        text = re.sub(r"[-\s]+", "-", text)
        return text.strip("-")

    def chunk_text(self, text: str, max_size: int = MAX_CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
        """Split text into overlapping chunks at sentence boundaries."""
        if len(text) <= max_size:
            return [text]

        chunks = []
        sentences = re.split(r"(?<=[.!?])\s+", text)

        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_len = len(sentence)

            if current_length + sentence_len > max_size and current_chunk:
                # Save current chunk
                chunks.append(" ".join(current_chunk))

                # Start new chunk with overlap
                overlap_text = " ".join(current_chunk)[-overlap:] if overlap > 0 else ""
                current_chunk = [overlap_text] if overlap_text else []
                current_length = len(overlap_text)

            current_chunk.append(sentence)
            current_length += sentence_len + 1  # +1 for space

        # Don't forget the last chunk
        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    def content_hash(self, content: str) -> str:
        """Generate MD5 hash of content for change detection."""
        return hashlib.md5(content.encode("utf-8")).hexdigest()

    def get_existing_hashes(self) -> Dict[str, str]:
        """Get content hashes of already indexed documents."""
        hashes = {}

        try:
            # Scroll through all points to get doc_path -> content_hash mapping
            offset = None
            while True:
                results, offset = self.qdrant.scroll(
                    collection_name=self.collection_name,
                    limit=100,
                    offset=offset,
                    with_payload=["doc_path", "content_hash"],
                )

                for point in results:
                    doc_path = point.payload.get("doc_path", "")
                    content_hash = point.payload.get("content_hash", "")
                    if doc_path and content_hash:
                        hashes[doc_path] = content_hash

                if offset is None:
                    break
        except Exception as e:
            print(f"  Warning: Could not fetch existing hashes: {e}")

        return hashes

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a batch of texts."""
        if not texts:
            return []

        response = self.openai.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts,
        )

        return [item.embedding for item in response.data]

    def process_document(self, file_path: Path, force_reindex: bool = False) -> List[DocChunk]:
        """Process a single markdown document into chunks."""
        rel_path = file_path.relative_to(self.docs_dir)
        doc_path = str(rel_path)

        # Read file
        content = file_path.read_text(encoding="utf-8")

        # Parse frontmatter
        metadata, body = self.parse_frontmatter(content)

        # Use filename as title if not in frontmatter
        doc_title = metadata.title or file_path.stem.replace("-", " ").replace("_", " ").title()

        # Infer category from path if not set
        category = metadata.category
        if not category and len(rel_path.parts) > 1:
            category = rel_path.parts[0]

        # Extract sections
        sections = self.extract_sections(body, doc_title)

        # Create chunks
        chunks = []
        chunk_index = 0

        for section in sections:
            section_chunks = self.chunk_text(section["content"])

            for chunk_text in section_chunks:
                if not chunk_text.strip():
                    continue

                chunk_id = f"{doc_path}#{section['anchor']}_{chunk_index}"

                chunk = DocChunk(
                    chunk_id=chunk_id,
                    doc_path=doc_path,
                    doc_title=doc_title,
                    section_heading=section["heading"],
                    section_anchor=section["anchor"],
                    content=chunk_text,
                    chunk_index=chunk_index,
                    metadata={
                        "status": metadata.status,
                        "summary": metadata.summary,
                        "category": category,
                        "audience": metadata.audience,
                        "tags": metadata.tags,
                        "last_updated": metadata.last_updated,
                        "related_services": metadata.related_services,
                        "content_hash": self.content_hash(content),
                        "url": f"/docs/{doc_path.replace('.md', '')}#{section['anchor']}",
                    },
                )

                chunks.append(chunk)
                chunk_index += 1

        return chunks

    async def index_chunks(self, chunks: List[DocChunk]) -> int:
        """Index chunks into Qdrant."""
        if not chunks or self.dry_run:
            return 0

        indexed = 0

        # Process in batches
        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i : i + BATCH_SIZE]
            texts = [c.content for c in batch]

            # Generate embeddings
            embeddings = await self.generate_embeddings(texts)

            # Create points
            points = []
            for chunk, embedding in zip(batch, embeddings):
                point = PointStruct(
                    id=hashlib.md5(chunk.chunk_id.encode()).hexdigest(),
                    vector=embedding,
                    payload={
                        "chunk_id": chunk.chunk_id,
                        "doc_path": chunk.doc_path,
                        "doc_title": chunk.doc_title,
                        "section_heading": chunk.section_heading,
                        "section_anchor": chunk.section_anchor,
                        "content": chunk.content,
                        "chunk_index": chunk.chunk_index,
                        **chunk.metadata,
                        "indexed_at": datetime.utcnow().isoformat(),
                    },
                )
                points.append(point)

            # Upsert to Qdrant
            self.qdrant.upsert(
                collection_name=self.collection_name,
                points=points,
            )

            indexed += len(points)

        return indexed

    def delete_document_chunks(self, doc_path: str) -> None:
        """Delete all chunks for a specific document."""
        if self.dry_run:
            return

        self.qdrant.delete(
            collection_name=self.collection_name,
            points_selector={
                "filter": {
                    "must": [
                        {"key": "doc_path", "match": {"value": doc_path}}
                    ]
                }
            },
        )

    async def process_docs(self, force_reindex: bool = False) -> Dict[str, int]:
        """Process all documentation files."""
        print(f"\nProcessing documentation from: {self.docs_dir}")
        print(f"Collection: {self.collection_name}")
        print(f"Mode: {'FORCE REINDEX' if force_reindex else 'INCREMENTAL'}")
        if self.dry_run:
            print("DRY RUN - No changes will be made")
        print("")

        # Ensure collection exists
        self._ensure_collection()

        # Get existing content hashes for incremental updates
        existing_hashes = {} if force_reindex else self.get_existing_hashes()
        print(f"Found {len(existing_hashes)} existing document hashes")

        # Find all markdown files
        md_files = list(self.docs_dir.glob("**/*.md"))
        print(f"Found {len(md_files)} markdown files\n")

        all_chunks = []

        for file_path in sorted(md_files):
            rel_path = str(file_path.relative_to(self.docs_dir))

            # Skip archive/deprecated
            if "archive" in rel_path.lower() or "deprecated" in rel_path.lower():
                continue

            # Check if content changed
            content = file_path.read_text(encoding="utf-8")
            content_hash = self.content_hash(content)

            if not force_reindex and rel_path in existing_hashes:
                if existing_hashes[rel_path] == content_hash:
                    self.stats["files_skipped"] += 1
                    continue
                else:
                    # Content changed - delete old chunks first
                    print(f"  Updated: {rel_path}")
                    self.delete_document_chunks(rel_path)
            else:
                print(f"  New: {rel_path}")

            try:
                chunks = self.process_document(file_path, force_reindex)
                all_chunks.extend(chunks)
                self.stats["files_processed"] += 1
                self.stats["chunks_created"] += len(chunks)
            except Exception as e:
                print(f"  Error processing {rel_path}: {e}")
                self.stats["errors"] += 1

        # Index all chunks
        if all_chunks:
            print(f"\nIndexing {len(all_chunks)} chunks...")
            indexed = await self.index_chunks(all_chunks)
            self.stats["chunks_indexed"] = indexed

        return self.stats


async def main():
    parser = argparse.ArgumentParser(description="Embed platform documentation into Qdrant")
    parser.add_argument("--force", action="store_true", help="Force re-index all documents")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without indexing")
    parser.add_argument("--collection", default=COLLECTION_NAME, help="Collection name")
    parser.add_argument("--docs-dir", default=None, help="Documentation directory")
    args = parser.parse_args()

    # Configuration
    qdrant_url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    docs_dir = args.docs_dir or str(Path(__file__).parent.parent / "docs")

    # Check OpenAI API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    print("=" * 60)
    print("Platform Documentation Embedder")
    print("=" * 60)
    print(f"Qdrant URL: {qdrant_url}")
    print(f"Docs Dir: {docs_dir}")
    print(f"Collection: {args.collection}")
    print(f"Embedding Model: {EMBEDDING_MODEL}")
    print(f"Chunk Size: {MAX_CHUNK_SIZE} chars, {CHUNK_OVERLAP} overlap")

    # Create embedder and run
    embedder = DocsEmbedder(
        qdrant_url=qdrant_url,
        docs_dir=docs_dir,
        collection_name=args.collection,
        dry_run=args.dry_run,
    )

    stats = await embedder.process_docs(force_reindex=args.force)

    # Print summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Files processed: {stats['files_processed']}")
    print(f"Files skipped (unchanged): {stats['files_skipped']}")
    print(f"Chunks created: {stats['chunks_created']}")
    print(f"Chunks indexed: {stats['chunks_indexed']}")
    print(f"Errors: {stats['errors']}")

    if stats["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
