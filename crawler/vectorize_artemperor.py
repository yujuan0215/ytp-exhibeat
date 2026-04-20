import argparse
import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter


DEFAULT_INPUT = Path("artemperor_tidbits_taipei_top5.json")
DEFAULT_OUTPUT = Path("artemperor_tidbits_taipei_top5_chunks.json")


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


class DeterministicHashEmbeddings(Embeddings):
    """
    Local deterministic fallback so the pipeline can be tested without API keys.
    """

    def __init__(self, dimensions: int = 256) -> None:
        self.dimensions = dimensions

    def _embed_single(self, text: str) -> List[float]:
        text = text or ""
        values: List[float] = []
        for i in range(self.dimensions):
            seed = f"{i}|{text}".encode("utf-8")
            digest = hashlib.sha256(seed).digest()
            # map to [-1, 1]
            num = int.from_bytes(digest[:4], byteorder="big", signed=False)
            values.append((num / 2**31) - 1.0)
        return values

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_single(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed_single(text)


def get_embeddings_backend() -> tuple[Embeddings, str]:
    if os.getenv("GOOGLE_API_KEY"):
        return (
            GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001"),
            "google:models/gemini-embedding-001",
        )
    if os.getenv("OPENAI_API_KEY"):
        # Secondary fallback if user has OpenAI configured.
        return OpenAIEmbeddings(model="text-embedding-3-small"), "openai:text-embedding-3-small"
    return DeterministicHashEmbeddings(dimensions=256), "deterministic-hash-256"


def normalize_date(raw: str) -> str:
    return re.sub(r"^(?:日期|展期|時間)\s*[:：]\s*", "", clean_text(raw))


def extract_items(payload: Any) -> List[Dict[str, Any]]:
    """
    Accept either:
    - crawler payload object with "items"
    - direct list of item objects
    """
    if isinstance(payload, dict):
        raw_items = payload.get("items", [])
        if isinstance(raw_items, list):
            return raw_items
        return []
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    return []


def build_documents(items: List[Dict[str, Any]]) -> List[Document]:
    docs: List[Document] = []
    for idx, item in enumerate(items):
        title = clean_text(item.get("title", ""))
        full_text = clean_text(item.get("full_text", ""))
        if not full_text:
            continue
        doc_id = hashlib.md5(f"{title}|{idx}".encode("utf-8")).hexdigest()  # stable id for this dataset
        metadata = {
            "doc_id": doc_id,
            "title": title,
            "date": normalize_date(item.get("date", "")),
            "location": clean_text(item.get("location", "")),
            "author": clean_text(item.get("author", "")),
            "source_url": "",
            "related_links": item.get("related_link", []),
            "images": item.get("image", []),
        }
        docs.append(Document(page_content=full_text, metadata=metadata))
    return docs


@dataclass
class ChunkRecord:
    chunk_id: str
    doc_id: str
    chunk_index: int
    chunk_text: str
    embedding: List[float]
    metadata: Dict[str, Any]


def chunk_and_embed(
    documents: List[Document],
    embedding_model: Embeddings,
    chunk_size: int,
    chunk_overlap: int,
) -> List[ChunkRecord]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "；", "，", " ", ""],
    )

    output: List[ChunkRecord] = []
    for doc in documents:
        split_docs = splitter.split_documents([doc])
        if not split_docs:
            continue
        vectors = embedding_model.embed_documents([d.page_content for d in split_docs])
        for i, (split_doc, vec) in enumerate(zip(split_docs, vectors)):
            doc_id = split_doc.metadata["doc_id"]
            output.append(
                ChunkRecord(
                    chunk_id=f"{doc_id}_{i}",
                    doc_id=doc_id,
                    chunk_index=i,
                    chunk_text=split_doc.page_content,
                    embedding=vec,
                    metadata={
                        "title": split_doc.metadata.get("title", ""),
                        "date": split_doc.metadata.get("date", ""),
                        "location": split_doc.metadata.get("location", ""),
                        "author": split_doc.metadata.get("author", ""),
                        "source_url": split_doc.metadata.get("source_url", ""),
                        "related_links": split_doc.metadata.get("related_links", []),
                        "images": split_doc.metadata.get("images", []),
                    },
                )
            )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Chunk + embed Artemperor tidbits with LangChain.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input JSON path.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output chunk JSON path.")
    parser.add_argument("--chunk-size", type=int, default=1200, help="Character chunk size.")
    parser.add_argument("--chunk-overlap", type=int, default=180, help="Character overlap.")
    parser.add_argument(
        "--max-chunks",
        type=int,
        default=0,
        help="Maximum chunks to keep in output. 0 means no limit.",
    )
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    items = extract_items(payload)
    documents = build_documents(items)

    embedding_model, embedding_backend = get_embeddings_backend()
    chunk_records = chunk_and_embed(
        documents=documents,
        embedding_model=embedding_model,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
    )
    if args.max_chunks > 0:
        chunk_records = chunk_records[: args.max_chunks]

    result = {
        "source_file": str(args.input),
        "embedding_backend": embedding_backend,
        "chunk_strategy": {
            "splitter": "RecursiveCharacterTextSplitter",
            "chunk_size": args.chunk_size,
            "chunk_overlap": args.chunk_overlap,
        },
        "document_count": len(documents),
        "chunk_count": len(chunk_records),
        "chunks": [
            {
                "chunk_id": c.chunk_id,
                "doc_id": c.doc_id,
                "chunk_index": c.chunk_index,
                "chunk_text": c.chunk_text,
                "embedding": c.embedding,
                "metadata": c.metadata,
            }
            for c in chunk_records
        ],
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Loaded documents: {len(documents)}")
    print(f"Generated chunks: {len(chunk_records)}")
    print(f"Embedding backend: {embedding_backend}")
    print(f"Output: {args.output.resolve()}")


if __name__ == "__main__":
    main()
