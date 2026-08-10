# Idemerax

Idemerax is a full-stack transaction processing platform inspired by financial systems. The project explores distributed reliability challenges with a focus on data integrity, transaction consistency, idempotency, fault tolerance, and recovery from unreliable networks.

## Core Scope

The MVP focuses on reliable transaction processing and includes:

* Account management
* Simulated money transfers
* Transaction processing and history
* Basic card management
* Authentication and authorization

The primary engineering focus is on:

* Idempotent transaction processing
* Data integrity and consistency
* Fault tolerance and failure handling
* Recovery from unreliable network conditions
* Reliable transaction state management

Real-world financial transactions, banking integrations, payment providers, card networks, and regulatory systems are outside the scope of the MVP.

## System Architecture

Idemerax follows a modular full-stack architecture with a React frontend, FastAPI backend, business logic layer, SQLAlchemy data access layer, and PostgreSQL database.

```text
React Frontend
      │
      │ REST / JSON
      ▼
FastAPI Backend
      │
      ▼
Business Logic
      │
      ▼
SQLAlchemy
      │
      ▼
PostgreSQL
```

The frontend is responsible for the user interface and communication with the backend API. Core transaction processing, validation, idempotency, and state management are handled by the backend.

> 📘 Detailed system architecture documentation will be added soon.

## Technology Stack

| Area              | Technologies                                        |
| ----------------- | --------------------------------------------------- |
| Backend           | Python, FastAPI, Pydantic, SQLAlchemy, Alembic      |
| Frontend          | TypeScript, React, Vite, Tailwind CSS               |
| Database          | PostgreSQL                                          |
| Infrastructure    | Docker, Docker Compose                              |
| CI/CD & DevSecOps | GitHub Actions, Dependabot, Bandit, Gitleaks, Trivy |
| Quality Assurance | pytest, Coverage.py, Ruff, ESLint, TypeScript       |

## Status

🚧 In development
