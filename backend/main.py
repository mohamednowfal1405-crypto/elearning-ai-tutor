import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
import io

from supabase_client import supabase
from rag import (
    process_and_store_document,
    search_relevant_chunks,
    generate_tutor_answer,
    generate_course_structure,
    generate_lesson_explanation,
    generate_lesson_quiz,
)

app = FastAPI(title="E-Learning AI Tutor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "E-Learning AI Tutor backend is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/upload")
async def upload_document(user_id: str, file: UploadFile = File(...)):
    """
    Receives a PDF, extracts its text, stores the file in Supabase Storage,
    saves a record in the documents table, then chunks + embeds the text
    for later semantic search (RAG).
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported right now.")

    file_bytes = await file.read()

    max_size_bytes = 10 * 1024 * 1024
    if len(file_bytes) > max_size_bytes:
        raise HTTPException(status_code=400, detail="File too large. Max size is 10MB.")

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        extracted_text = ""
        for page in reader.pages:
            extracted_text += page.extract_text() or ""
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {str(e)}")

    if not extracted_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No text could be extracted. This PDF might be scanned images rather than real text.",
        )

    storage_path = f"{user_id}/{uuid.uuid4()}_{file.filename}"
    try:
        supabase.storage.from_("documents").upload(
            storage_path, file_bytes, {"content-type": "application/pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    try:
        result = (
            supabase.table("documents")
            .insert(
                {
                    "user_id": user_id,
                    "filename": file.filename,
                    "storage_path": storage_path,
                    "extracted_text": extracted_text,
                }
            )
            .execute()
        )
        document_id = result.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insert failed: {str(e)}")

    # Chunk + embed the document for RAG search
    try:
        chunk_count = process_and_store_document(document_id, user_id, extracted_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding/chunking failed: {str(e)}")

    return {
        "message": "Upload successful",
        "filename": file.filename,
        "text_length": len(extracted_text),
        "document_id": document_id,
        "chunks_created": chunk_count,
    }


@app.get("/ask")
def ask_question(user_id: str, document_id: int, question: str):
    """
    Debug/testing endpoint: given a question, find the most relevant chunks
    from a specific document, without generating an AI answer.
    Useful for checking retrieval quality directly.
    """
    try:
        relevant_chunks = search_relevant_chunks(question, user_id, document_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    return {
        "question": question,
        "relevant_chunks": relevant_chunks,
    }


@app.get("/chat")
def chat_with_tutor(user_id: str, document_id: int, question: str):
    """
    The real AI tutor endpoint: retrieves relevant context from the
    student's document, then asks Gemini to answer using only that context.
    """
    try:
        relevant_chunks = search_relevant_chunks(question, user_id, document_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    try:
        answer = generate_tutor_answer(question, relevant_chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    return {
        "question": question,
        "answer": answer,
    }


@app.post("/generate-course")
def generate_course(user_id: str, document_id: int):
    """
    Generates a structured mini-course from a document's full text,
    and saves the result so it can be reloaded later without regenerating.
    """
    # 1. Fetch the document's full extracted text
    try:
        doc_result = (
            supabase.table("documents")
            .select("filename, extracted_text")
            .eq("id", document_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Document not found: {str(e)}")

    filename = doc_result.data["filename"]
    document_text = doc_result.data["extracted_text"]

    # 2. Ask Gemini to design the course
    try:
        course_data = generate_course_structure(document_text, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Course generation failed: {str(e)}")

    # 3. Save the generated course
    try:
        result = (
            supabase.table("courses")
            .insert(
                {
                    "document_id": document_id,
                    "user_id": user_id,
                    "title": course_data["course_title"],
                    "lessons": course_data["lessons"],
                }
            )
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Saving course failed: {str(e)}")

    return {
        "course_id": result.data[0]["id"],
        "title": course_data["course_title"],
        "lessons": course_data["lessons"],
    }


@app.get("/lesson-detail")
def lesson_detail(user_id: str, document_id: int, lesson_title: str, lesson_summary: str):
    """
    Generates a deeper explanation for one specific lesson within a
    generated course, grounded in the student's document content.
    """
    try:
        explanation = generate_lesson_explanation(
            lesson_title, lesson_summary, user_id, document_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lesson generation failed: {str(e)}")

    return {"explanation": explanation}


@app.get("/lesson-quiz")
def lesson_quiz(user_id: str, document_id: int, lesson_title: str, lesson_summary: str):
    """
    Generates a short multiple-choice quiz for one specific lesson,
    grounded in the student's document content.
    """
    try:
        questions = generate_lesson_quiz(
            lesson_title, lesson_summary, user_id, document_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")

    if not questions:
        raise HTTPException(
            status_code=404,
            detail="Not enough content found to generate a quiz for this lesson.",
        )

    return {"questions": questions}