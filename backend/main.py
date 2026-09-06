import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
import io

from supabase_client import supabase

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
    and saves a record (with extracted text) in the documents table.
    """
    # 1. Basic validation
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported right now.")

    file_bytes = await file.read()

    # Limit file size to 10MB to avoid abuse / huge free-tier storage usage
    max_size_bytes = 10 * 1024 * 1024
    if len(file_bytes) > max_size_bytes:
        raise HTTPException(status_code=400, detail="File too large. Max size is 10MB.")

    # 2. Extract text from the PDF
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

    # 3. Upload the raw file to Supabase Storage
    storage_path = f"{user_id}/{uuid.uuid4()}_{file.filename}"
    try:
        supabase.storage.from_("documents").upload(
            storage_path, file_bytes, {"content-type": "application/pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    # 4. Save a record in the documents table
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insert failed: {str(e)}")

    return {
        "message": "Upload successful",
        "filename": file.filename,
        "text_length": len(extracted_text),
        "document_id": result.data[0]["id"] if result.data else None,
    }