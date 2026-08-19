from fastapi import FastAPI

app = FastAPI(
    title="Idemerax API",
    description=(
        "Full-stack transaction processing platform focused on "
        "data integrity, transaction consistency, idempotency, "
        "fault tolerance, and recovery from unreliable networks."
    ),
    version="0.1.0",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}