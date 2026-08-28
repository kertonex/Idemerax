from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Idemerax API",
    description=(
        "Full-stack transaction processing platform focused on "
        "data integrity, transaction consistency, idempotency, "
        "fault tolerance, and recovery from unreliable networks."
    ),
    version="0.1.0",
)

# Allow requests from the local frontend during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
