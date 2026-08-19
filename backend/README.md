# Idemerax Backend

The Idemerax backend is a FastAPI application responsible for API handling and the core backend workflows of the Idemerax transaction processing platform.

The backend follows a modular architecture that separates API handling, application workflows, domain logic, and infrastructure concerns.

## Technology Stack

* Python
* FastAPI
* Pydantic
* Uvicorn
* pytest
* Ruff
* Coverage.py
* uv

## Requirements

* Python version specified in `pyproject.toml`
* uv

## Setup

From the `backend/` directory, install the project dependencies:

```bash
uv sync
```

This creates or updates the local virtual environment and installs the configured dependencies.

## Run the Application

Start the FastAPI development server with:

```bash
uv run uvicorn app.main:app --reload
```

The API is available at:

```text
http://127.0.0.1:8000
```

## API Documentation

FastAPI provides interactive API documentation.

### Swagger UI

```text
http://127.0.0.1:8000/docs
```

### ReDoc

```text
http://127.0.0.1:8000/redoc
```

## Health Check

The backend provides an initial health check endpoint:

```http
GET /health
```

A successful response is:

```json
{
  "status": "ok"
}
```

The endpoint is covered by an integration test located at:

```text
tests/integration/api/test_health.py
```

## Testing

Backend tests are organized by test type:

```text
tests/
├── e2e/
├── integration/
│   ├── api/
│   └── database/
└── unit/
    ├── application/
    └── domain/
```

Run the complete test suite with:

```bash
uv run pytest
```

## Code Quality

Ruff is used for backend linting and code quality checks.

Run Ruff with:

```bash
uv run ruff check .
```

## Test Coverage

Coverage.py is used to measure backend test coverage.

Run the test suite with coverage:

```bash
uv run coverage run -m pytest
```

Display the coverage report:

```bash
uv run coverage report
```

Generate an HTML coverage report:

```bash
uv run coverage html
```

The generated report is available at:

```text
htmlcov/index.html
```

## Project Structure

```text
Idemerax/
└── backend/
    ├── app/
    │   ├── main.py
    │   ├── api/
    │   │   └── routes/
    │   ├── application/
    │   │   ├── accounts/
    │   │   ├── idempotency/
    │   │   └── transactions/
    │   ├── core/
    │   ├── domain/
    │   │   ├── account/
    │   │   ├── idempotency/
    │   │   ├── shared/
    │   │   └── transaction/
    │   ├── infrastructure/
    │   │   ├── database/
    │   │   │   └── models/
    │   │   ├── reliability/
    │   │   └── repositories/
    │   └── schemas/
    │
    ├── tests/
    │   ├── e2e/
    │   ├── integration/
    │   │   ├── api/
    │   │   └── database/
    │   └── unit/
    │       ├── application/
    │       └── domain/
    │
    ├── .python-version
    ├── pyproject.toml
    ├── uv.lock
    └── README.md
```

## Development Workflow

All backend commands should be executed from the `backend/` directory.

Install or synchronize dependencies:

```bash
uv sync
```

Run the test suite:

```bash
uv run pytest
```

Run Ruff:

```bash
uv run ruff check .
```

Run tests with coverage:

```bash
uv run coverage run -m pytest
```

Display the coverage report:

```bash
uv run coverage report
```

Start the development server:

```bash
uv run uvicorn app.main:app --reload
```

## Development Checks

Before submitting backend changes, the following checks should pass:

```bash
uv run pytest
uv run ruff check .
uv run coverage run -m pytest
uv run coverage report
```

## Status

🚧 In development
