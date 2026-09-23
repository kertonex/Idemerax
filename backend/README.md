# ⚙️ Idemerax Backend

### Reliable backend infrastructure for a transaction-processing platform

The Idemerax backend is the server-side foundation of a full-stack transaction-processing platform designed around the reliability requirements of financial-style systems.

It is built with FastAPI and PostgreSQL and uses a layered architecture to separate API handling, application workflows, domain concepts, persistence, and infrastructure concerns.

## 🧭 Overview

The **Idemerax Backend** provides the server-side foundation for a full-stack transaction-processing platform designed around the reliability requirements of financial-style systems.

It combines a layered application architecture with secure authentication, asynchronous PostgreSQL persistence, explicit database migrations, automated testing, security analysis, and reproducible CI/CD validation.


The backend is organized around clear architectural boundaries and
currently provides the authentication foundation, PostgreSQL
persistence, database migrations, repository abstractions, automated
testing, and containerized execution required by the platform.

### Core engineering concerns

-   🔐 Secure authentication and protected API access
-   🗄️ Reliable PostgreSQL persistence
-   🔄 Controlled token and session lifecycles
-   🧩 Separation of API, application, domain, and infrastructure
    concerns
-   🛡️ Secure credential and token handling
-   🧪 Automated unit and integration testing
-   🐳 Reproducible containerized execution

Idemerax is a **fintech MVP and engineering demonstration environment**.
It does not connect to real banks, payment providers, card networks, or
regulatory systems, and it does not process real financial transactions.

## 🏛️ Architecture

The backend follows a layered architecture that separates HTTP concerns, application workflows, domain concepts, and technical infrastructure:

``` text
┌──────────────────────────────┐
│            API               │
│ Routes / Dependencies        │
│ Request & Response Schemas   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Application            │
│ Authentication Use Cases     │
│ Repository Ports             │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│          Domain              │
│     Business Concepts        │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Infrastructure         │
│ SQLAlchemy / Repositories    │
│ Database / Reliability       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│         PostgreSQL           │
└──────────────────────────────┘
```

The current implementation has a complete authentication workflow built
on top of this structure. The account, transaction, idempotency, and
reliability directories establish the architectural boundaries for the
broader platform.

------------------------------------------------------------------------

## 🧩 Application & Domain Structure

### 🌐 API Layer

The API layer exposes the HTTP interface of the backend.

Current responsibilities include:

-   FastAPI application configuration
-   Authentication routes
-   Authentication dependencies
-   Request validation
-   Response schemas
-   CORS configuration
-   Health checks

Authentication routes are grouped under:

``` text
/auth
```

Current authentication endpoints are:

``` text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

------------------------------------------------------------------------

### 💼 Application Layer

Application services contain authentication use cases independently from
the HTTP layer.

Current authentication use cases include:

``` text
app/application/authentication/
├── authenticate_user.py
├── ports.py
├── register_user.py
├── renew_access_token.py
└── revoke_refresh_session.py
```

The authentication application layer is responsible for:

-   Authenticating users
-   Registering users
-   Renewing access tokens
-   Rotating refresh tokens
-   Revoking refresh sessions
-   Defining repository ports required by the use cases

This keeps authentication workflows separate from FastAPI route handling
and database implementation details.

------------------------------------------------------------------------

### 🧠 Domain Layer

The backend contains dedicated domain boundaries for:

``` text
app/domain/
├── account/
├── idempotency/
├── shared/
└── transaction/
```

These boundaries are intended to isolate business concepts from API and
infrastructure concerns.

The current repository structure establishes these boundaries while the
corresponding domain behavior is developed alongside the application
features.

------------------------------------------------------------------------

### 🗄️ Infrastructure Layer

The infrastructure layer contains technical implementations required by
the application.

Current areas include:

``` text
app/infrastructure/
├── database/
├── reliability/
└── repositories/
```

The database infrastructure uses SQLAlchemy's asynchronous API and
PostgreSQL through the Psycopg driver.

Repositories provide database access to application workflows without
exposing SQLAlchemy session operations directly to the authentication
use cases.

------------------------------------------------------------------------

## 🎯 Engineering Focus

The backend architecture is designed around the reliability characteristics that define Idemerax:

| Focus | Backend approach |
| --- | --- |
| 🔐 Authentication | Argon2id password hashing, RS256 JWTs, protected routes, refresh-session management |
| 🗄️ Data Integrity | PostgreSQL constraints, typed persistence models, explicit migrations |
| 🔄 Session Reliability | Refresh-token rotation and server-side session revocation |
| 🧩 Separation of Concerns | API, application, domain, and infrastructure boundaries |
| 🧪 Verification | Unit and integration tests with coverage reporting |
| 🛡️ Security | Gitleaks, Trivy, Bandit, CodeQL, secure cookie configuration |
| 🐳 Reproducibility | Locked dependencies and containerized builds |

## 🧰 Technology Stack

The backend combines a modern Python API stack with asynchronous persistence, explicit migrations, security-focused authentication, and automated quality tooling.

| Area | Technology |
| --- | --- |
| Language | Python 3.14+ |
| API Framework | FastAPI |
| Validation | Pydantic |
| Configuration | Pydantic Settings |
| Database | PostgreSQL |
| ORM | SQLAlchemy 2 |
| Database Driver | Psycopg 3 |
| Migrations | Alembic |
| Password Hashing | Argon2id |
| JWT | PyJWT |
| JWT Signing | RSA / RS256 |
| Application Server | Uvicorn |
| Testing | pytest |
| HTTP Testing | HTTPX |
| Coverage | Coverage.py |
| Linting | Ruff |
| Security Analysis | Bandit |
| Package Management | uv |
| Containerization | Docker |
| Continuous Integration | GitHub Actions |
| Security Scanning | Bandit · Gitleaks · Trivy · CodeQL |

## 🔐 Authentication

Authentication is the main implemented application workflow in the
current backend.

The authentication architecture separates:

``` text
Credentials
    │
    ▼
Application Use Case
    │
    ├── Password Verification
    │
    ├── User Repository
    │
    ▼
Access Token + Refresh Session
```

### 👤 Registration

Users can register using:

-   Email address
-   Password

Request validation is handled through Pydantic schemas.

Current password constraints are:

``` text
Minimum: 15 characters
Maximum: 128 characters
```

Email addresses are validated using `EmailStr` and limited to a maximum
length of 254 characters.

Registration performs an application-level duplicate check and the
database also enforces a unique constraint on the user's email address.

A database `UniqueViolation` is handled at the API boundary to protect
against duplicate registrations caused by concurrent requests.

After successful registration, the backend creates:

-   A signed access token
-   A refresh token
-   A persisted refresh session

------------------------------------------------------------------------

### 🔑 Password Security

Passwords are never stored in plaintext.

The backend uses **Argon2id** through `argon2-cffi` for password hashing
and verification.

The security module provides:

``` text
hash_password()
verify_password()
```

Password verification failures are handled without exposing sensitive
authentication details.

------------------------------------------------------------------------

### 🎫 Access Tokens

Access tokens are JWTs signed using an RSA private key.

The current configuration uses:

``` text
Algorithm: RS256
Issuer:    idemerax
Audience:  idemerax-api
Lifetime:  15 minutes
```

The JWT contains:

``` text
sub
iat
exp
iss
aud
```

The backend validates:

-   Signature
-   Algorithm
-   Issuer
-   Audience
-   Expiration

The private and public JWT keys are loaded from configured file paths.

Private key material must never be committed to version control.

------------------------------------------------------------------------

### 🔄 Refresh Sessions

Refresh tokens are generated using Python's cryptographically secure
`secrets` module.

The raw refresh token is not stored in the database.

Instead:

``` text
Refresh Token
     │
     ▼
SHA-256
     │
     ▼
Stored Token Hash
```

The `refresh_sessions` table stores:

-   Session ID
-   User ID
-   Token hash
-   Expiration timestamp
-   Creation timestamp

The current refresh-session lifetime is:

``` text
30 days
```

------------------------------------------------------------------------

### ♻️ Refresh Token Rotation

The `/auth/refresh` endpoint performs refresh-session rotation.

The flow is:

``` text
Existing Refresh Token
          │
          ▼
      Hash Token
          │
          ▼
Find Refresh Session
          │
          ├── Missing → Reject
          ├── Expired → Reject
          └── Invalid User → Reject
          │
          ▼
Delete Existing Session
          │
          ▼
Create New Refresh Token
          │
          ▼
Persist New Session
          │
          ▼
Create New Access Token
```

The old refresh session is deleted before the new session is created.

------------------------------------------------------------------------

### 🚫 Refresh Session Revocation

Refresh sessions can be revoked through the logout workflow.

The logout endpoint:

``` text
POST /auth/logout
```

finds the refresh session using the hashed refresh token and removes it
from the database.

The refresh-token cookie is also cleared from the client.

A revoked refresh token therefore cannot be used to create another
access token.

------------------------------------------------------------------------

### 🍪 Refresh Token Cookie

Refresh tokens are delivered through a cookie named:

``` text
__Host-refresh_token
```

The cookie is configured with:

``` text
HttpOnly: true
Secure:   true
SameSite: lax
```

This keeps the refresh token inaccessible to client-side JavaScript and
restricts how the browser sends the cookie.

------------------------------------------------------------------------

### 🛡️ Protected API Access

Protected endpoints use the `get_current_user` dependency.

The dependency:

1.  Extracts the Bearer token from the `Authorization` header.
2.  Decodes and verifies the JWT.
3.  Reads the user ID from the `sub` claim.
4.  Loads the user through `UserRepository`.
5.  Rejects missing or inactive users.
6.  Returns the authenticated `User`.

Invalid credentials result in:

``` text
401 Unauthorized
```

The current authenticated-user endpoint is:

``` text
GET /auth/me
```

------------------------------------------------------------------------

## 🗄️ Database & Persistence

Idemerax uses PostgreSQL with SQLAlchemy's asynchronous engine.

The database connection is created using:

``` text
postgresql+psycopg://
```

SQLAlchemy uses:

``` python
AsyncEngine
AsyncSession
async_sessionmaker
```

The application provides database sessions through FastAPI dependency
injection.

Successful requests are committed automatically, while exceptions
trigger a rollback.

------------------------------------------------------------------------

## 🧱 Database Models

The current database model layer contains:

``` text
User
Account
Transaction
Card
RefreshSession
```

### 👤 User

The `users` table contains:

-   `id`
-   `email`
-   `password_hash`
-   `role`
-   `is_active`
-   `created_at`
-   `updated_at`

Email addresses are unique.

------------------------------------------------------------------------

### 💰 Account

The `accounts` table contains:

-   `id`
-   `user_id`
-   `balance`

Balances use:

``` text
NUMERIC(19, 4)
```

The account is associated with a user through a foreign key.

------------------------------------------------------------------------

### 💳 Card

The `cards` table contains:

-   `id`
-   `status`
-   `card_type`

------------------------------------------------------------------------

### 💸 Transaction

The `transactions` table contains:

-   `id`
-   `amount`
-   `transaction_type`
-   `status`
-   `created_at`

Amounts use:

``` text
NUMERIC(19, 4)
```

------------------------------------------------------------------------

### 🔄 RefreshSession

The `refresh_sessions` table contains:

-   `id`
-   `user_id`
-   `token_hash`
-   `expires_at`
-   `created_at`

The token hash is unique and the user relationship uses cascading
deletion.

------------------------------------------------------------------------

## 🗃️ Database Migrations

Alembic manages database schema changes.

The current migration history includes:

``` text
59fa6455a178
└── create initial database schema

c305d0979ce3
└── add authentication fields to users

1760345b3dca
└── create refresh sessions table
```

Apply all pending migrations:

``` bash
uv run alembic upgrade head
```

Create a migration after model changes:

``` bash
uv run alembic revision --autogenerate -m "describe migration"
```

Generated migrations should always be reviewed before they are applied.

------------------------------------------------------------------------

## 🔌 Repository Pattern

Database access for authentication is isolated behind repository
classes.

Current repositories include:

``` text
app/infrastructure/repositories/
├── refresh_session.py
└── user.py
```

`UserRepository` provides operations such as:

``` text
get_by_email()
get_by_id()
create()
```

`RefreshSessionRepository` provides:

``` text
get_by_token_hash()
create()
delete()
```

Authentication application services depend on repository ports rather
than directly depending on concrete database operations.

This keeps application workflows decoupled from the repository
implementation.

------------------------------------------------------------------------

## ⚙️ Configuration

Application settings are loaded using Pydantic Settings from environment
variables and `.env`.

Database configuration includes:

``` text
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
```

JWT configuration includes:

``` text
JWT_PRIVATE_KEY_PATH
JWT_PUBLIC_KEY_PATH
JWT_ALGORITHM
JWT_ACCESS_TOKEN_EXPIRE_MINUTES
JWT_ISSUER
JWT_AUDIENCE
```

Refresh-session configuration includes:

``` text
REFRESH_SESSION_EXPIRE_DAYS
```

The application currently defaults to:

``` text
JWT algorithm:              RS256
Access token lifetime:      15 minutes
Refresh session lifetime:   30 days
JWT issuer:                 idemerax
JWT audience:               idemerax-api
```

Sensitive values must be supplied through the local environment and must
not be committed.

------------------------------------------------------------------------

## 🌐 API

FastAPI exposes automatic API documentation.

### Swagger UI

``` text
http://127.0.0.1:8000/docs
```

### ReDoc

``` text
http://127.0.0.1:8000/redoc
```

### Health Check

``` http
GET /health
```

Successful response:

``` json
{
  "status": "ok"
}
```

### Authentication Endpoints

  -----------------------------------------------------------------------
  Method                  Endpoint                Purpose
  ----------------------- ----------------------- -----------------------
  `POST`                  `/auth/register`        Register a new user

  `POST`                  `/auth/login`           Authenticate a user

  `POST`                  `/auth/refresh`         Renew the access token
                                                  and rotate the refresh
                                                  token

  `POST`                  `/auth/logout`          Revoke the refresh
                                                  session

  `GET`                   `/auth/me`              Return the
                                                  authenticated user
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 🧪 Testing

The backend uses pytest with asynchronous tests for database and API
behavior.

The test suite is organized into:

``` text
tests/
├── integration/
│   ├── api/
│   └── database/
└── unit/
    ├── application/
    │   └── authentication/
    ├── core/
    ├── database/
    └── schemas/
```

### Unit Tests

Unit tests cover:

-   Authentication use cases
-   Registration
-   Access-token renewal
-   Refresh-session revocation
-   Password hashing and verification
-   Database configuration
-   SQLAlchemy models
-   Database sessions
-   Authentication schemas

### Integration Tests

Integration tests cover:

-   Authentication API behavior
-   CORS configuration
-   Health checks
-   Database persistence
-   Repository behavior
-   Commit and rollback behavior
-   Database transactions

Run the complete test suite:

``` bash
uv run pytest
```

------------------------------------------------------------------------

## 📊 Coverage

Coverage.py is configured for branch coverage and measures the `app`
package.

Run the test suite with coverage:

``` bash
uv run coverage run -m pytest
```

Display the report:

``` bash
uv run coverage report
```

Generate an HTML report:

``` bash
uv run coverage html
```

The generated report is available at:

``` text
htmlcov/index.html
```

------------------------------------------------------------------------

## 🧹 Code Quality & Security

### Ruff

Ruff is configured with:

``` text
Line length: 88
Target:      Python 3.14
Rules:       E, F, I
```

Run Ruff:

``` bash
uv run ruff check .
```

### Bandit

Bandit is included in the development dependencies for Python security
analysis.

Run Bandit with:

``` bash
uv run bandit -r app
```

------------------------------------------------------------------------

## 🐳 Docker

The backend uses a multi-stage Docker build.

The image is built from Python 3.14 slim images and uses `uv` for
dependency installation.

The build consists of:

``` text
Builder Stage
     │
     ├── Install locked production dependencies
     └── Copy application
             │
             ▼
Runtime Stage
     │
     ├── Apply base-image security updates
     ├── Copy application environment
     ├── Remove unnecessary pip/setuptools packages
     └── Start Uvicorn
```

The container exposes:

``` text
8000
```

The default container command is:

``` bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Production dependencies are installed from the locked `uv.lock` file.

------------------------------------------------------------------------

## 🔄 Continuous Integration

The repository uses **GitHub Actions** to validate every push and pull request. The backend is tested against a PostgreSQL 17 service container so integration tests run against the same database engine used by the application.

Backend validation in CI includes:

- 🔎 repository secret scanning with **Gitleaks**
- 🛡️ dependency vulnerability scanning with **Trivy**
- 📦 locked dependency installation with `uv`
- 🔑 generation of isolated RSA keys for authentication tests
- 🗃️ Alembic migrations against the CI PostgreSQL database
- 🧪 the complete backend pytest suite with Coverage.py
- 🧹 static analysis with **Ruff**
- 🔐 Python security analysis with **Bandit**
- 🐳 backend Docker image build validation
- 🛡️ vulnerability scanning of the built backend image with **Trivy**
- 🔬 **CodeQL** analysis for Python source code

Coverage is exported as a Cobertura XML artifact and included in the repository's pull-request coverage report. Coverage is reported for visibility; the workflow does not currently enforce a minimum threshold.

The same repository workflow also validates the frontend and runs its integration tests against the live backend service, providing an additional cross-stack integration check.

---

## 🚀 Local Development

### Prerequisites

Install:

-   Python 3.14+
-   uv
-   PostgreSQL

From the repository root:

``` bash
cd backend
```

Synchronize dependencies:

``` bash
uv sync
```

Configure the required environment variables in `.env`.

Apply database migrations:

``` bash
uv run alembic upgrade head
```

Start the development server:

``` bash
uv run uvicorn app.main:app --reload
```

The API is then available at:

``` text
http://127.0.0.1:8000
```

------------------------------------------------------------------------

## 🔄 Development Workflow

A typical backend development cycle is:

``` text
1. Update application/domain/infrastructure code
                    │
                    ▼
2. Update database models when required
                    │
                    ▼
3. Generate and review Alembic migration
                    │
                    ▼
4. Apply migrations
                    │
                    ▼
5. Add or update unit/integration tests
                    │
                    ▼
6. Run pytest
                    │
                    ▼
7. Run coverage
                    │
                    ▼
8. Run Ruff / security checks
```

Recommended checks before committing backend changes:

``` bash
uv run pytest
uv run coverage run -m pytest
uv run coverage report
uv run ruff check .
uv run bandit -r app
```

------------------------------------------------------------------------

## 📁 Project Structure

``` text
backend/
│
├── app/
│   ├── api/
│   │   ├── dependencies.py
│   │   └── routes/
│   │       └── authentication.py
│   │
│   ├── application/
│   │   ├── accounts/
│   │   ├── authentication/
│   │   │   ├── authenticate_user.py
│   │   │   ├── ports.py
│   │   │   ├── register_user.py
│   │   │   ├── renew_access_token.py
│   │   │   └── revoke_refresh_session.py
│   │   ├── idempotency/
│   │   └── transactions/
│   │
│   ├── core/
│   │   ├── config.py
│   │   └── security.py
│   │
│   ├── domain/
│   │   ├── account/
│   │   ├── idempotency/
│   │   ├── shared/
│   │   └── transaction/
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── base.py
│   │   │   ├── connection.py
│   │   │   ├── models/
│   │   │   └── session.py
│   │   ├── reliability/
│   │   └── repositories/
│   │       ├── refresh_session.py
│   │       └── user.py
│   │
│   ├── main.py
│   └── schemas/
│       └── authentication.py
│
├── alembic/
│   ├── env.py
│   └── versions/
│
├── tests/
│   ├── integration/
│   │   ├── api/
│   │   └── database/
│   └── unit/
│       ├── application/
│       │   └── authentication/
│       ├── core/
│       ├── database/
│       └── schemas/
│
├── Dockerfile
├── alembic.ini
├── pyproject.toml
├── README.md
└── uv.lock
```

------------------------------------------------------------------------

## 🛡️ Security Considerations

The backend applies several security measures to the authentication
flow:

-   🔐 Argon2id password hashing
-   🔑 RSA-signed JWT access tokens
-   ⏱️ Short-lived access tokens
-   ♻️ Refresh-token rotation
-   🗃️ Hashed refresh tokens in persistent storage
-   🍪 HttpOnly refresh-token cookies
-   🔒 Secure refresh-token cookies
-   🌐 SameSite cookie protection
-   🚫 Refresh-session revocation
-   🧱 Database uniqueness constraints
-   🛑 Authentication failures return generic credential errors

JWT private keys and other secrets must remain outside version control.

This project is not intended for production financial use.

------------------------------------------------------------------------

## 📚 Related Documentation

- [📖 Project README](https://github.com/kertonex/Idemerax/blob/main/README.md)
- [🤝 Contribution Guidelines](https://github.com/kertonex/Idemerax/blob/main/CONTRIBUTING.md)
- [🔒 Security Policy](https://github.com/kertonex/Idemerax/blob/main/SECURITY.md)
- [🏗️ Project Organization](https://github.com/kertonex/Idemerax/blob/main/docs/architecture/project-organization.md)
- [📐 Development Conventions](https://github.com/kertonex/Idemerax/blob/main/docs/conventions.md)


## 🚧 Development Status

Idemerax is actively developed as a fintech MVP and engineering
demonstration project.

The backend currently provides the authentication foundation together
with the persistence, migration, testing, and infrastructure foundations
for the broader transaction-processing platform.
