import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
import io

from supabase_client import supabase
from rag import process_and_store_document, search_relevant_chunks

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

    # NEW: chunk + embed the document for RAG search
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
    Test endpoint: given a question, find the most relevant chunks
    from a specific document. (We'll connect this to Gemini chat generation next.)
    """
    try:
        relevant_chunks = search_relevant_chunks(question, user_id, document_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    return {
        "question": question,
        "relevant_chunks": relevant_chunks,
    }