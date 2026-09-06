import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

from supabase_client import supabase

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

EMBEDDING_MODEL = "gemini-embedding-001"  # Current Gemini embedding model


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> list[str]:
    """
    Splits text into overlapping chunks (measured in characters).
    Overlap helps preserve context that might otherwise get cut across chunk boundaries.
    """
    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap

    return [c.strip() for c in chunks if c.strip()]


def get_embedding(text: str) -> list[float]:
    """Calls Gemini's embedding API to convert text into a 768-number vector."""
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=768,
        ),
    )
    return result.embeddings[0].values


def process_and_store_document(document_id: int, user_id: str, full_text: str):
    """
    Chunks a document's text, embeds each chunk, and stores everything in
    the document_chunks table for later semantic search.
    """
    chunks = chunk_text(full_text)

    rows_to_insert = []
    for chunk in chunks:
        embedding = get_embedding(chunk)
        rows_to_insert.append(
            {
                "document_id": document_id,
                "user_id": user_id,
                "chunk_text": chunk,
                "embedding": embedding,
            }
        )

    if rows_to_insert:
        supabase.table("document_chunks").insert(rows_to_insert).execute()

    return len(rows_to_insert)


def search_relevant_chunks(query: str, user_id: str, document_id: int, match_count: int = 4):
    """
    Embeds the user's question, then finds the most semantically similar
    chunks from that specific document using pgvector similarity search.
    """
    query_embedding = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=query,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY", output_dimensionality=768,),
    ).embeddings[0].values

    result = supabase.rpc(
        "match_document_chunks",
        {
            "query_embedding": query_embedding,
            "match_user_id": user_id,
            "match_document_id": document_id,
            "match_count": match_count,
        },
    ).execute()

    return [row["chunk_text"] for row in result.data]