from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="E-Learning AI Tutor API")

# CORS lets our React frontend (running on a different port) talk to this backend.
# In Phase 9 (deployment) we'll restrict this to your real frontend URL instead of "*".
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
    """Simple endpoint the frontend (or you) can ping to confirm the backend is alive."""
    return {"status": "ok"}