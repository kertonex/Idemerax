# Project Organization

## Overview

Idemerax uses a structured repository layout to separate API handling, application workflows, domain logic, infrastructure concerns, frontend application structure, testing, and project documentation.

The initial structure establishes clear module boundaries and provides a foundation for incremental feature development.

---

## Repository Structure


```text
Idemerax/
├── .gitignore
├── LICENSE
├── README.md
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   │
│   │   ├── application/
│   │   │   ├── accounts/
│   │   │   ├── idempotency/
│   │   │   └── transactions/
│   │   │
│   │   ├── core/
│   │   │
│   │   ├── domain/
│   │   │   ├── account/
│   │   │   ├── idempotency/
│   │   │   ├── shared/
│   │   │   └── transaction/
│   │   │
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   │   └── models/
│   │   │   ├── reliability/
│   │   │   └── repositories/
│   │   │
│   │   └── schemas/
│   │
│   └── tests/
│       ├── e2e/
│       │
│       ├── integration/
│       │   ├── api/
│       │   └── database/
│       │
│       └── unit/
│           ├── application/
│           └── domain/
│
├── frontend/
│   └── src/
│       ├── components/
│       ├── features/
│       ├── pages/
│       ├── routes/
│       └── shared/
│           ├── types/
│           └── utils/
│
└── docs/
    ├── architecture/
    ├── decisions/
    └── reliability/
```

---

## Backend

The `backend/` directory contains the backend application and its test suites.

### Application

Location:

```text
backend/app/
```

Contains the main backend application and its internal modules.

---

## API

Location:

```text
backend/app/api/
```

Contains API-related functionality, including REST routes and request handling.

The API layer is responsible for communication with external clients and should delegate business operations to the application layer rather than implementing core business rules directly.

---

## Application

Location:

```text
backend/app/application/
```

Contains application-level workflows and use cases.

The application layer coordinates domain operations and keeps application workflows separate from infrastructure-specific implementations.

The current application areas are:

* `accounts/` — account-related application workflows
* `transactions/` — transaction-related application workflows
* `idempotency/` — idempotency-related application workflows

---

## Domain

Location:

```text
backend/app/domain/
```

Contains the core business concepts and business rules of Idemerax.

The domain is divided into focused areas:

* `account/` — account-related domain concepts
* `transaction/` — transaction-related domain concepts and state
* `idempotency/` — concepts related to idempotent processing
* `shared/` — domain concepts shared across multiple domain areas

The domain layer should remain independent from API and infrastructure concerns.

---

## Core

Location:

```text
backend/app/core/
```

Contains shared application-level concerns such as configuration, security, and logging.

---

## Infrastructure

Location:

```text
backend/app/infrastructure/
```

Contains technical implementations and infrastructure-related concerns.

### Database

Location:

```text
backend/app/infrastructure/database/
```

Contains database-related infrastructure and persistence models.

The `models/` directory contains database-specific models.

### Repositories

Location:

```text
backend/app/infrastructure/repositories/
```

Contains persistence access implementations used by the application.

### Reliability

Location:

```text
backend/app/infrastructure/reliability/
```

Contains infrastructure-level mechanisms related to retry, recovery, and failure handling.

---

## Schemas

Location:

```text
backend/app/schemas/
```

Contains data schemas used for API communication, validation, and data transfer.

---

## Testing

Location:

```text
backend/tests/
```

Tests are separated according to their scope.

### Unit Tests

Location:

```text
backend/tests/unit/
```

Contains isolated tests for application and domain behavior.

* `application/`
* `domain/`

### Integration Tests

Location:

```text
backend/tests/integration/
```

Contains tests that verify interactions between application components and infrastructure.

* `api/`
* `database/`

### End-to-End Tests

Location:

```text
backend/tests/e2e/
```

Contains tests for complete application workflows.

---

## Documentation

Location:

```text
docs/
```

Contains project and engineering documentation.

### Architecture

Location:

```text
docs/architecture/
```

Contains documentation describing system architecture and project organization.

### Decisions

Location:

```text
docs/decisions/
```

Contains architectural decision records and the reasoning behind significant technical decisions.

### Reliability

Location:

```text
docs/reliability/
```

Contains documentation related to failure scenarios, recovery strategies, and reliability requirements.

---

## Repository-Level Files

### `.gitignore`

Defines files and directories that should not be tracked by Git.

### `README.md`

Provides the project overview and general project documentation.

### `LICENSE`

Contains the project's licensing information.

---

## Organization Principles

The project structure follows these principles:

* Separate API handling from application workflows
* Separate application workflows from domain rules
* Keep domain logic independent from infrastructure concerns
* Maintain clear responsibilities between modules
* Keep critical business logic modular and testable
* Separate tests according to their scope
* Keep project documentation separate from application code
* Provide dedicated areas for architecture, technical decisions, and reliability
* Prefer simple and maintainable boundaries over unnecessary complexity

This structure represents the initial organizational foundation of Idemerax and can evolve as implementation requirements become clearer.
