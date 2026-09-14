from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.authentication import router as authentication_router

app = FastAPI(
    title="Idemerax API",
    description=(
        "Full-stack transaction processing platform focused on "
        "data integrity, transaction consistency, idempotency, "
        "fault tolerance, and recovery from unreliable networks."
    ),
    version="0.1.0",
)

app.include_router(authentication_router)

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
