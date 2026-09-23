<p align="center">
  <img src="frontend/src/assets/idemerax-logo.svg" alt="Idemerax logo" width="96">
</p>

<p align="center">
  <strong>Idemerax</strong><br>
  Reliable transaction processing for a full-stack financial-style system.
</p>

<p align="center">
  <a href="https://github.com/kertonex/Idemerax/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/kertonex/Idemerax/ci.yml?branch=main&label=CI%20%C2%B7%20Quality%20%26%20Security&logo=github" alt="CI · Quality & Security">
  </a>
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-2563EB?logo=react&logoColor=white" alt="Frontend: React + TypeScript">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white" alt="Backend: FastAPI">
  <img src="https://img.shields.io/badge/Database-PostgreSQL-336791?logo=postgresql&logoColor=white" alt="Database: PostgreSQL">
</p>

---

## 🚀 What is Idemerax?

Idemerax is a full-stack transaction-processing platform inspired by financial systems. It explores how transaction workflows can remain reliable when requests fail, are retried, arrive more than once, or encounter unreliable network conditions.

Idemerax is intentionally developed as an **MVP and engineering demonstration project** rather than a production banking system. The MVP provides a simulated financial-style application environment for exploring reliable transaction processing and the engineering challenges surrounding it.

The project focuses on building a clear separation between presentation, API handling, application workflows, domain rules, persistence, and reliability mechanisms.

## 🎯 Problem & Engineering Goals

Financial-style transaction systems have to handle more than simply moving data from one state to another. Requests can fail, be retried, arrive multiple times, or be interrupted by unreliable network conditions.

<table>
  <tr>
    <td width="50%">
      <strong>⚠️ The Problem</strong><br><br>
      A failed, duplicated, or interrupted request can result in duplicate operations, inconsistent state, or partially applied changes.
    </td>
    <td width="50%">
      <strong>🎯 The Goal</strong><br><br>
      Keep transaction processing predictable and application state reliable, even when requests do not behave as expected.
    </td>
  </tr>
</table>

The project therefore focuses on integrity, consistency, idempotency, fault tolerance, and reliable recovery from interrupted or duplicated requests.

## 🎯 Core Scope

The MVP focuses on reliable transaction processing within a simulated financial-style application environment and includes account management, simulated money transfers, transaction history, basic card management, and authentication.

The primary engineering focus is on:

| Engineering Focus | Description |
| --- | --- |
| 🔄 **Idempotent Processing** | Prevent repeated logical requests from producing unintended duplicate effects. |
| 🛡️ **Data Integrity & Consistency** | Preserve valid relationships and consistent application state. |
| 🧱 **Fault Tolerance** | Handle failures without silently leaving partially applied state. |
| 🌐 **Network Recovery** | Safely recover from interrupted, duplicated, or retried requests. |
| 🔁 **Reliable Transaction State** | Keep transaction state explicit and predictable throughout processing. |

> **Out of scope:** Real-world financial transactions, banking integrations, payment providers, card networks, and regulatory systems are outside the scope of the MVP.

---

## ✨ Key Features

<table>
  <tr>
    <td width="48%">
      <strong>🔐 Authentication</strong><br><br>
      User registration, login, protected API access, JWT authentication, and refresh-session lifecycle management.
    </td>
    <td width="4%"></td>
    <td width="48%">
      <strong>💳 Account Management</strong><br><br>
      Account-oriented workflows backed by persistent database state.
    </td>
  </tr>

  <tr>
    <td colspan="3"><br></td>
  </tr>

  <tr>
    <td width="48%">
      <strong>💸 Transaction Processing</strong><br><br>
      Simulated money transfers with validation and reliable transaction state transitions.
    </td>
    <td width="4%"></td>
    <td width="48%">
      <strong>📜 Transaction History</strong><br><br>
      Persistent transaction records and historical transaction visibility.
    </td>
  </tr>

  <tr>
    <td colspan="3"><br></td>
  </tr>

  <tr>
    <td width="48%">
      <strong>🔄 Idempotency</strong><br><br>
      Safe handling of repeated logical requests and retry scenarios.
    </td>
    <td width="4%"></td>
    <td width="48%">
      <strong>💳 Basic Card Management</strong><br><br>
      Basic card-related application functionality within the MVP scope.
    </td>
  </tr>

  <tr>
    <td colspan="3"><br></td>
  </tr>

  <tr>
    <td width="48%">
      <strong>🗄️ Persistence &amp; Migrations</strong><br><br>
      PostgreSQL persistence with SQLAlchemy and Alembic database migrations.
    </td>
    <td width="4%"></td>
    <td width="48%">
      <strong>🧪 Automated Quality</strong><br><br>
      Backend and frontend tests, static analysis, formatting, linting, security checks, and CI.
    </td>
  </tr>
</table>

---

## 🏗️ Architecture

Idemerax follows a modular full-stack architecture. The React frontend communicates with the FastAPI backend over REST/JSON. The backend separates HTTP/API concerns, application workflows, domain concepts, and infrastructure before persisting state in PostgreSQL.

### Architecture Diagram

### Architecture Diagram

```text
┌───────────────────────────────────────────────┐
│                    Frontend                   │
│         React · TypeScript · Vite             │
│          Tailwind · React Router              │
└───────────────────────┬───────────────────────┘
                        │
                   REST / JSON
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                    API Layer                  │
│       FastAPI · Validation · Auth             │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│               Application Layer               │
│             Use Cases · Workflows             │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  Domain Layer                 │
│      Accounts · Transactions · Idempotency    │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│             Infrastructure Layer              │
│ SQLAlchemy · Repositories · Database Services │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  PostgreSQL                   │
└───────────────────────────────────────────────┘
```

### Architectural Boundaries

| Layer | Responsibility |
| --- | --- |
| **🖥️ Frontend** | Presentation, routing, authentication state, API communication, and user interaction. |
| **🔌 API** | HTTP endpoints, request/response schemas, authentication dependencies, and transport concerns. |
| **⚙️ Application** | Coordinates use cases and application workflows. |
| **🧠 Domain** | Contains account, transaction, idempotency, and shared business concepts. |
| **🏗️ Infrastructure** | Persistence, repositories, database sessions, and reliability-related infrastructure. |
| **🗄️ PostgreSQL** | Durable application state. |

For detailed backend architecture and module responsibilities, see [`backend/README.md`](backend/README.md) and [`docs/architecture/project-organization.md`](docs/architecture/project-organization.md).

## ⚛️ Frontend

The frontend is a React and TypeScript application built with Vite and Tailwind CSS. It follows a feature-oriented structure while keeping reusable layout components, routing, API infrastructure, and shared resources separated.

### Frontend Responsibilities

| Area | Responsibility |
| --- | --- |
| 🔐 Authentication UI | Login, registration, logout, authentication state, and protected application access. |
| 🧭 Routing | Public and authenticated application routes. |
| 🔌 API Integration | Communication with the backend REST API. |
| 🧩 UI Structure | Shared layouts, navigation, reusable components, and page composition. |
| ⏳ State & Errors | Loading states, API errors, and authentication lifecycle handling. |
| 🧪 Testing | Component, page, routing, and feature API tests. |

### Frontend Stack

`React` · `TypeScript` · `Vite` · `React Router` · `Tailwind CSS` · `Vitest` · `React Testing Library` · `ESLint` · `Prettier`

## 🐍 Backend

The backend provides the API and transaction-processing foundation of the platform. It uses a layered architecture to keep HTTP concerns, application workflows, domain logic, persistence, and infrastructure concerns separated.

### Backend Stack

`Python 3.14+` · `FastAPI` · `Pydantic` · `SQLAlchemy 2` · `Psycopg 3` · `PostgreSQL` · `Alembic` · `Uvicorn`

Detailed backend architecture, database information, authentication details, testing, and development instructions are documented in [`backend/README.md`](backend/README.md).

## 🔐 Authentication & Security

Authentication is implemented as a full-stack flow between the frontend and backend.

### Authentication Design

| Mechanism | Implementation |
| --- | --- |
| Password storage | **Argon2id** password hashing |
| Access authentication | Short-lived **JWT** access tokens |
| Token signing | RSA / **RS256** |
| JWT validation | Issuer and audience validation |
| Session renewal | Refresh sessions with token rotation |
| Logout | Refresh-session revocation |
| Refresh-token storage | Secure `HttpOnly` cookie |
| Protected access | Authentication-aware frontend routes and protected backend endpoints |
| Database protection | Authentication-related constraints and persistent session state |
| Configuration | Environment-based credentials, paths, and security settings |

Refresh tokens are not stored as plaintext in the database. The backend stores a SHA-256 hash of the refresh token.

### Repository Security Tooling

`Gitleaks` · `Bandit` · `Trivy` · `CodeQL`

For security reporting and project security practices, see [`SECURITY.md`](SECURITY.md).

## 🔄 Reliability, Idempotency & Consistency

Reliability is a central engineering concern of Idemerax rather than an isolated feature.

### Idempotency

Idempotency is used to ensure that retrying a logical transaction request does not unintentionally apply the same operation multiple times.

The design addresses scenarios such as network timeouts, interrupted connections, client retries, duplicate submissions, and requests whose outcome is temporarily uncertain.

The idempotency mechanism is intended to integrate with transaction processing so request identity and transaction state remain consistent across retries.

### Data Integrity

Data integrity is supported through:

```text
Database relationships
        │
        ├── Unique and foreign-key constraints
        │
        ├── Application-level validation
        │
        ├── Repository-based persistence
        │
        └── Explicit transaction boundaries
```

### Transaction Consistency

Related state changes are handled within explicit database transaction boundaries. Successful operations are committed, while failed operations are rolled back so an unsuccessful operation does not leave partially applied state behind.

The reliability model will continue to evolve as the remaining transaction-processing and idempotency functionality is implemented.

## 🛠️ Technology Stack

| Area | Technologies |
| --- | --- |
| **⚛️ Frontend** | React, TypeScript, Vite, Tailwind CSS |
| **🐍 Backend** | Python, FastAPI, Pydantic, SQLAlchemy |
| **🗄️ Database** | PostgreSQL |
| **🔄 Migrations** | Alembic |
| **🔐 Authentication** | Argon2id, JWT, RSA / RS256 |
| **🐳 Infrastructure** | Docker, Docker Compose |
| **🧪 Testing** | pytest, Coverage.py, Vitest, React Testing Library |
| **✨ Code Quality** | Ruff, ESLint, TypeScript, Prettier |
| **🚀 CI / DevSecOps** | GitHub Actions, Gitleaks, Bandit, Trivy, CodeQL |

## 🧪 Testing & Quality

Idemerax uses automated testing and static quality checks across the backend and frontend.

### Backend Testing

`pytest` · unit tests · integration tests · API tests · database/persistence tests · `Coverage.py`

### Frontend Testing

`Vitest` · `React Testing Library` · `jsdom` · component tests · page tests · routing tests · API tests

### Automated Quality Checks

`Ruff` · `ESLint` · `TypeScript` · `Prettier` · `Bandit` · `Gitleaks` · `Trivy` · `CodeQL`

### Continuous Integration

GitHub Actions validates the project through automated checks covering tests, coverage, type checking, linting, formatting, database migrations, Docker builds/scans, secret scanning, static security analysis, and CodeQL analysis.

The repository also uses pre-commit checks for formatting, linting, tests, secret scanning, and commit-message conventions.

## 🚀 Getting Started

### Prerequisites

| Tool | Purpose |
| --- | --- |
| `Git` | Clone and manage the repository |
| `Python 3.14+` | Backend runtime |
| `uv` | Python dependency and environment management |
| `Node.js` + `npm` | Frontend runtime and package management |
| `PostgreSQL` | Local application database |
| `OpenSSL` | Local RSA JWT key generation |
| `Docker` + `Docker Compose` | Containerized workflows |

### 1. Clone the Repository

```bash
git clone https://github.com/kertonex/Idemerax.git
cd Idemerax
```

### 2. Configure Environment Variables

Create local environment files from the provided templates:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The root `.env` is used by Docker Compose. Backend and frontend `.env` files contain application-specific configuration.

> Do not commit local `.env` files, credentials, or private keys.

### 3. Generate Local JWT Keys

The backend expects RSA keys at the paths configured by `JWT_PRIVATE_KEY_PATH` and `JWT_PUBLIC_KEY_PATH`.

From the repository root:

```bash
cd backend
mkdir -p secrets

openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
```

The generated files are local development secrets and are excluded from version control.

### 4. Prepare the Database

Configure the PostgreSQL connection values in `backend/.env`, then apply the current schema:

```bash
cd backend
uv run alembic upgrade head
```

Migration files are stored in:

```text
backend/alembic/versions/
```

### 5. Start the Backend

From `backend/`:

```bash
uv run uvicorn app.main:app --reload
```

Backend API: `http://localhost:8000`

Health check: `http://localhost:8000/health`

### 6. Start the Frontend

In a second terminal:

```bash
cd ~/Idemerax/frontend
npm ci
npm run dev
```

Frontend: `http://localhost:5173`

The frontend uses `VITE_API_URL` from `frontend/.env` to determine the backend API base URL.

## 🔌 API Documentation

The backend exposes a REST/JSON API consumed by the React frontend.

When the backend is running, FastAPI provides interactive API documentation at:

```text
http://localhost:8000/docs
```

ReDoc is available at:

```text
http://localhost:8000/redoc
```

### Current Authentication Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Authenticate a user |
| `POST` | `/auth/refresh` | Rotate the refresh session and issue a new access token |
| `POST` | `/auth/logout` | Revoke the refresh session |
| `GET` | `/auth/me` | Retrieve the authenticated user |
| `GET` | `/health` | Backend health check |

The interactive API documentation is the authoritative reference for request and response schemas.

## 📂 Project Structure

The repository is organized around a clear separation of backend responsibilities, frontend features, testing, infrastructure, and engineering documentation.

The structure below reflects the tracked project files and intentionally excludes local environment files, generated coverage/build artifacts, credentials, secrets, caches, and other files excluded from version control.

> 📘 For a detailed overview of project organization and module responsibilities, see [`docs/architecture/project-organization.md`](docs/architecture/project-organization.md).

```text
Idemerax/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   ├── pull_request_template.md
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── alembic/
│   │   └── versions/
│   │       ├── 1760345b3dca_create_refresh_sessions_table.py
│   │       ├── 59fa6455a178_create_initial_database_schema.py
│   │       └── c305d0979ce3_add_authentication_fields_to_users.py
│   ├── app/
│   │   ├── api/
│   │   │   ├── dependencies.py
│   │   │   └── routes/
│   │   │       └── authentication.py
│   │   ├── application/
│   │   │   ├── accounts/
│   │   │   ├── authentication/
│   │   │   │   ├── authenticate_user.py
│   │   │   │   ├── ports.py
│   │   │   │   ├── register_user.py
│   │   │   │   ├── renew_access_token.py
│   │   │   │   └── revoke_refresh_session.py
│   │   │   ├── idempotency/
│   │   │   └── transactions/
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── security.py
│   │   ├── domain/
│   │   │   ├── account/
│   │   │   ├── idempotency/
│   │   │   ├── shared/
│   │   │   └── transaction/
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   │   ├── models/
│   │   │   │   │   ├── account.py
│   │   │   │   │   ├── card.py
│   │   │   │   │   ├── refresh_session.py
│   │   │   │   │   ├── transaction.py
│   │   │   │   │   └── user.py
│   │   │   │   ├── base.py
│   │   │   │   ├── connection.py
│   │   │   │   └── session.py
│   │   │   ├── reliability/
│   │   │   └── repositories/
│   │   │       ├── refresh_session.py
│   │   │       └── user.py
│   │   ├── main.py
│   │   └── schemas/
│   │       └── authentication.py
│   ├── tests/
│   │   ├── e2e/
│   │   ├── integration/
│   │   │   ├── api/
│   │   │   │   ├── test_authentication_api.py
│   │   │   │   ├── test_cors.py
│   │   │   │   └── test_health.py
│   │   │   └── database/
│   │   │       ├── test_persistence.py
│   │   │       ├── test_repositories.py
│   │   │       └── test_transactions.py
│   │   └── unit/
│   │       ├── application/
│   │       │   └── authentication/
│   │       │       ├── test_authenticate_user.py
│   │       │       ├── test_register_user.py
│   │       │       ├── test_renew_access_token.py
│   │       │       └── test_revoke_refresh_session.py
│   │       ├── core/
│   │       │   └── test_security.py
│   │       ├── database/
│   │       │   ├── test_base.py
│   │       │   ├── test_connection.py
│   │       │   ├── test_models.py
│   │       │   └── test_session.py
│   │       ├── domain/
│   │       └── schemas/
│   │           └── test_authentication.py
│   ├── .dockerignore
│   ├── .env.example
│   ├── .python-version
│   ├── Dockerfile
│   ├── README.md
│   ├── alembic.ini
│   ├── pyproject.toml
│   └── uv.lock
├── docs/
│   ├── architecture/
│   │   └── project-organization.md
│   ├── decisions/
│   ├── reliability/
│   └── conventions.md
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   │   ├── hero.png
│   │   │   └── idemerax-logo.svg
│   │   ├── components/
│   │   │   └── layout/
│   │   │       ├── AppShell.tsx
│   │   │       ├── AuthLayout.tsx
│   │   │       ├── Header.tsx
│   │   │       ├── MainContent.tsx
│   │   │       └── Sidebar.tsx
│   │   ├── features/
│   │   │   └── authentication/
│   │   │       ├── api/
│   │   │       │   └── authentication.ts
│   │   │       ├── components/
│   │   │       │   ├── LoginForm.tsx
│   │   │       │   └── RegisterForm.tsx
│   │   │       └── context/
│   │   │           ├── AuthContext.ts
│   │   │           ├── AuthProvider.tsx
│   │   │           └── useAuth.ts
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   ├── routes/
│   │   │   └── AppRoutes.tsx
│   │   ├── shared/
│   │   │   ├── api/
│   │   │   │   ├── client.ts
│   │   │   │   └── health.ts
│   │   │   ├── types/
│   │   │   │   └── api.ts
│   │   │   └── utils/
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── tests/
│   │   ├── api/
│   │   │   ├── apiClient.test.ts
│   │   │   ├── health.test.ts
│   │   │   └── healthIntegration.test.ts
│   │   ├── components/
│   │   │   ├── authentication/
│   │   │   │   ├── AuthProvider.test.tsx
│   │   │   │   ├── LoginForm.test.tsx
│   │   │   │   └── RegisterForm.test.tsx
│   │   │   └── layout/
│   │   │       ├── AppShell.test.tsx
│   │   │       └── Header.test.tsx
│   │   ├── features/
│   │   │   └── authentication/
│   │   │       └── api/
│   │   │           └── authentication.test.ts
│   │   ├── pages/
│   │   │   ├── LoginPage.test.tsx
│   │   │   └── RegisterPage.test.tsx
│   │   ├── routes/
│   │   │   └── AppRoutes.test.tsx
│   │   └── setup.ts
│   ├── .dockerignore
│   ├── .env.example
│   ├── .prettierignore
│   ├── .prettierrc
│   ├── Dockerfile
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── tsconfig.test.json
│   └── vite.config.ts
├── .env.example
├── .gitignore
├── .pre-commit-config.yaml
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── commitlint.config.cjs
├── docker-compose.yml
├── package-lock.json
└── package.json
```

## 📋 Development Commands

### Backend

```bash
cd backend

# Run tests
uv run pytest -v

# Collect coverage
uv run coverage run -m pytest
uv run coverage report

# Lint and format
uv run ruff check .
uv run ruff format .

# Security analysis
uv run bandit -r app
```

### Frontend

```bash
cd frontend

# Development server
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Formatting
npm run format
npm run format:check

# Tests
npm test

# Production build
npm run build

# Local preview
npm run preview
```
## ⚠️ Scope & Limitations

The MVP focuses on simulated financial-style transaction processing and does **not** provide:

| Out of scope | Status |
| --- | --- |
| Real bank integrations | ❌ Not implemented |
| Real payment providers | ❌ Not implemented |
| Card-network integration | ❌ Not implemented |
| Real-money movement | ❌ Not implemented |
| Production banking infrastructure | ❌ Not implemented |
| Regulatory / compliance systems | ❌ Not implemented |
| Production financial data | ❌ Not used |

All application data used by the project is test, mock, or generated data.

## 📚 Documentation

| Document | Purpose |
| --- | --- |
| [`backend/README.md`](backend/README.md) | Backend architecture, setup, testing, persistence, and development details. |
| [`docs/architecture/project-organization.md`](docs/architecture/project-organization.md) | Project organization and module responsibilities. |
| [`docs/conventions.md`](docs/conventions.md) | Repository and development conventions. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution workflow, branching, and commit conventions. |
| [`SECURITY.md`](SECURITY.md) | Security practices and vulnerability reporting. |
| [`LICENSE`](LICENSE) | Project licensing information. |

## 🤝 Contributing

Contributions are welcome through the repository's contribution workflow.

Please review [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request. The project uses Conventional Commits and automated quality checks to keep changes consistent and maintainable.

## 🔒 Security

Please review [`SECURITY.md`](SECURITY.md) for security practices and vulnerability reporting guidance.

Never commit passwords, tokens, private keys, credentials, or other secrets. Local configuration and generated JWT keys are intentionally excluded from version control.

## 📄 License

See [`LICENSE`](LICENSE) for the project's license and applicable terms.

## ⚠️ Fintech Disclaimer

Idemerax is an educational and development project inspired by financial transaction systems. It is **not** a bank, payment institution, financial service, or production-ready financial platform.

The system does not process real money and should not be used with real financial credentials, payment information, or production financial data.
