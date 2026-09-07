import os
import json
import time
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


def generate_tutor_answer(question: str, relevant_chunks: list[str]) -> str:
    """
    Sends the user's question + the relevant document chunks to Gemini,
    instructing it to answer ONLY based on that content (this is the
    core of RAG - grounding the AI's answer in real, retrieved material).

    Retries automatically if Gemini's free tier is briefly overloaded (503),
    since these spikes are usually short-lived.
    """
    if not relevant_chunks:
        return "I couldn't find anything relevant to that question in your uploaded document. Try rephrasing, or ask about something else covered in the material."

    context = "\n\n---\n\n".join(relevant_chunks)

    prompt = f"""You are a friendly, patient AI tutor helping a student understand their own uploaded material.

Use ONLY the context below to answer the student's question. If the answer isn't in the context, say so honestly rather than guessing or using outside knowledge.

Explain clearly, like a good tutor would - break things down simply if the question suggests the student is still learning the topic.

CONTEXT FROM THE STUDENT'S DOCUMENT:
{context}

STUDENT'S QUESTION:
{question}

YOUR ANSWER:"""

    max_attempts = 3
    wait_seconds = 1

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
            )
            return response.text
        except Exception as e:
            is_overloaded = "503" in str(e) or "UNAVAILABLE" in str(e)
            is_last_attempt = attempt == max_attempts

            if is_overloaded and not is_last_attempt:
                time.sleep(wait_seconds)
                wait_seconds *= 2  # back off a bit longer each retry
                continue

            if is_overloaded:
                return "The AI tutor is experiencing high demand right now. Please try asking again in a few seconds."

            # Not an overload issue - some other real error, don't hide it
            raise

def generate_course_structure(document_text: str, filename: str) -> dict:
    """
    Sends the full document text to Gemini and asks it to design a
    structured mini-course (title + a list of lessons with summaries)
    based on that content. Returns a Python dict.
    """
    prompt = f"""You are an expert curriculum designer. A student has uploaded a document called "{filename}" and wants you to turn its content into a structured mini-course.

Read the content below and design a course with:
- An overall course title (short and descriptive)
- Between 4 and 8 lessons, each covering a distinct part of the material, in a logical learning order
- Each lesson needs: a short title, and a 1-2 sentence summary of what it covers

Respond with ONLY valid JSON, no other text, no markdown code fences, in exactly this structure:
{{
  "course_title": "string",
  "lessons": [
    {{"lesson_number": 1, "title": "string", "summary": "string"}}
  ]
}}

DOCUMENT CONTENT:
{document_text}
"""

    max_attempts = 3
    wait_seconds = 1

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            is_overloaded = "503" in str(e) or "UNAVAILABLE" in str(e)
            is_last_attempt = attempt == max_attempts

            if is_overloaded and not is_last_attempt:
                time.sleep(wait_seconds)
                wait_seconds *= 2
                continue

            raise

def generate_lesson_explanation(
    lesson_title: str, lesson_summary: str, user_id: str, document_id: int
) -> str:
    """
    Generates a detailed, tutor-style explanation for one specific lesson,
    grounded in the most relevant chunks of the student's own document.
    """
    # Reuse our existing RAG search, using the lesson title+summary as the "question"
    search_query = f"{lesson_title}: {lesson_summary}"
    relevant_chunks = search_relevant_chunks(search_query, user_id, document_id, match_count=5)

    if not relevant_chunks:
        return "I couldn't find enough detail in your document to expand on this lesson further."

    context = "\n\n---\n\n".join(relevant_chunks)

    prompt = f"""You are a patient, friendly AI tutor teaching a lesson within a course you designed for a student, based on their own uploaded material.

LESSON TITLE: {lesson_title}
LESSON SUMMARY: {lesson_summary}

Using ONLY the context below (from the student's own document), write a clear, well-structured lesson explanation. Teach the concepts properly - explain what things mean, why they matter, and how they connect - as if this were a real lesson, not just a summary. Use short paragraphs or bullet points where helpful. Keep it focused on this lesson's topic only.

CONTEXT FROM THE STUDENT'S DOCUMENT:
{context}

LESSON EXPLANATION:"""

    max_attempts = 3
    wait_seconds = 1

    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
            )
            return response.text
        except Exception as e:
            is_overloaded = "503" in str(e) or "UNAVAILABLE" in str(e)
            is_last_attempt = attempt == max_attempts

            if is_overloaded and not is_last_attempt:
                time.sleep(wait_seconds)
                wait_seconds *= 2
                continue

            if is_overloaded:
                return "The AI tutor is experiencing high demand right now. Please try again in a few seconds."

            raise