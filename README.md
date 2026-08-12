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


## Initial Project Structure

The initial project structure is designed around clear separation of responsibilities between API handling, application logic, domain rules, infrastructure concerns, and testing.

The backend follows a modular architecture where core business logic remains independent from external frameworks and infrastructure details. The documentation directory contains architectural decisions, conventions, and reliability-related design notes that support the development process.

```text
Idemerax
├── .gitignore
├── LICENSE
├── README.md
├── backend
│   ├── app
│   │   ├── api
│   │   │   └── routes
│   │   ├── application
│   │   │   ├── accounts
│   │   │   ├── idempotency
│   │   │   └── transactions
│   │   ├── core
│   │   ├── domain
│   │   │   ├── account
│   │   │   ├── idempotency
│   │   │   ├── shared
│   │   │   └── transaction
│   │   ├── infrastructure
│   │   │   ├── database
│   │   │   │   └── models
│   │   │   ├── reliability
│   │   │   └── repositories
│   │   └── schemas
│   └── tests
│       ├── e2e
│       ├── integration
│       │   ├── api
│       │   └── database
│       └── unit
│           ├── application
│           └── domain
└── docs
    ├── architecture
    │   └── project-organization.md
    ├── conventions.md
    ├── decisions
    └── reliability
```


## Frontend Setup

The frontend is built with React, TypeScript, Vite, ESLint, and Tailwind CSS.

### Create the Frontend

From the project root:

```bash
npm create vite@latest frontend
```

Select the following options:

```text
Framework:
React

Variant:
TypeScript

Linter:
ESLint

Install with npm and start now?
Yes
```

### Install Tailwind CSS

Stop the development server if it is running:

```text
Ctrl + C
```

Navigate to the frontend directory:

```bash
cd frontend
```

Install Tailwind CSS and the Vite plugin:

```bash
npm install tailwindcss @tailwindcss/vite
```

### Configure Tailwind CSS

Update `frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

Import Tailwind CSS in `src/index.css`:

```css
@import "tailwindcss";
```

### Verify the Setup

A simple Tailwind component can be used to verify that the configuration is working:

```tsx
function App() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <h1 className="text-4xl font-bold text-white">
        Idemerax
      </h1>
    </div>
  )
}

export default App
```

Start the development server:

```bash
npm run dev
```

The frontend is typically available at:

```text
http://localhost:5173
```

Stop the development server when finished:

```text
Ctrl + C
```

### Linting

Run ESLint:

```bash
npm run lint
```

### Production Build

Build the frontend:

```bash
npm run build
```

### Preview

Preview the production build locally:

```bash
npm run preview
```


## Status

🚧 In development
