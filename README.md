# Idemerax

Idemerax is a full-stack transaction processing platform inspired by financial systems. The project explores distributed reliability challenges with a focus on data integrity, transaction consistency, idempotency, fault tolerance, and recovery from unreliable networks.

---

## 📌 Project Information

This project is a development and demonstration environment focused on reliable transaction processing concepts.

The MVP does not represent a production banking system and does not include real financial integrations, payment providers, card networks, or regulatory systems.

Only test data, mock data, and generated sample data should be used during development and testing.

---

## 🎯 Core Scope

The MVP focuses on reliable transaction processing and includes:

- Account management
- Simulated money transfers
- Transaction processing and history
- Basic card management
- Authentication and authorization

The primary engineering focus is on:

- Idempotent transaction processing
- Data integrity and consistency
- Fault tolerance and failure handling
- Recovery from unreliable network conditions
- Reliable transaction state management

Real-world financial transactions, banking integrations, payment providers, card networks, and regulatory systems are outside the scope of the MVP.

---

## 🏗️ System Architecture

Idemerax follows a modular full-stack architecture with a React frontend, FastAPI backend, application and domain layers, SQLAlchemy data access, and PostgreSQL persistence.

```text
React Frontend
      │
      │ REST / JSON
      ▼
FastAPI Backend
      │
      ▼
Application Layer
      │
      ▼
Domain Layer
      │
      ▼
Infrastructure
      │
      ▼
PostgreSQL
````

The frontend is responsible for the user interface and communication with the backend API.

Core transaction processing, validation, idempotency, and transaction state management are handled by the backend.

---

## 📚 Repository Documentation

The repository contains additional documentation covering development workflows, contribution standards, security practices, and architectural decisions.

Important documentation:

* [Contribution Guidelines](CONTRIBUTING.md)
* [Security Policy](SECURITY.md)
* [Project Organization](docs/architecture/project-organization.md)
* [Development Conventions](docs/conventions.md)

---

## 🛠️ Technology Stack

| Area              | Technologies                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| Backend           | Python, FastAPI, Pydantic, SQLAlchemy, Alembic                               |
| Frontend          | TypeScript, React, Vite, Tailwind CSS                                        |
| Database          | PostgreSQL                                                                   |
| Infrastructure    | Docker, Docker Compose                                                       |
| CI/CD & DevSecOps | GitHub Actions, Dependabot, Bandit, Gitleaks, Trivy                          |
| Quality Assurance | pytest, Coverage.py, Ruff, ESLint, TypeScript, Vitest, React Testing Library |

---

## 📂 Project Structure

The project structure is designed around clear separation of responsibilities between API handling, application workflows, domain rules, infrastructure concerns, frontend application structure, testing, and documentation.

The backend follows a modular architecture where core domain logic remains independent from API and infrastructure concerns.

The frontend follows a feature-oriented structure to keep UI components, application features, pages, routing, and shared resources clearly separated.

> 📘 For a detailed overview of the project organization and module responsibilities, see the [Project Organization](docs/architecture/project-organization.md) documentation.

```text
Idemerax/
├── .github/
│   └── ISSUE_TEMPLATE/
├── .gitignore
├── .pre-commit-config.yaml
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   ├── application/
│   │   │   ├── accounts/
│   │   │   ├── idempotency/
│   │   │   └── transactions/
│   │   ├── core/
│   │   ├── domain/
│   │   │   ├── account/
│   │   │   ├── idempotency/
│   │   │   ├── shared/
│   │   │   └── transaction/
│   │   ├── infrastructure/
│   │   │   ├── database/
│   │   │   │   └── models/
│   │   │   ├── reliability/
│   │   │   └── repositories/
│   │   └── schemas/
│   └── tests/
│       ├── e2e/
│       ├── integration/
│       │   ├── api/
│       │   └── database/
│       └── unit/
│           ├── application/
│           └── domain/
├── commitlint.config.cjs
├── docs/
│   ├── architecture/
│   ├── decisions/
│   └── reliability/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   └── layout/
│   │   ├── features/
│   │   ├── pages/
│   │   ├── routes/
│   │   └── shared/
│   │       ├── types/
│   │       └── utils/
│   └── tests/
│       └── components/
│           └── layout/
├── package-lock.json
└── package.json
```

---

## 💻 Frontend Setup

The frontend is built with React, TypeScript, Vite, ESLint, and Tailwind CSS.

### 🚀 Create the Frontend

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

### 🎨 Install Tailwind CSS

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

### ⚙️ Configure Tailwind CSS

Update:

```text
frontend/vite.config.ts
```

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

Import Tailwind CSS in:

```text
src/index.css
```

```css
@import "tailwindcss";
```

### ✅ Verify the Setup

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

### 🔍 Linting

Run ESLint:

```bash
npm run lint
```

### 📦 Production Build

Build the frontend:

```bash
npm run build
```

### 👀 Preview

Preview the production build locally:

```bash
npm run preview
```

---

## 🧪 Frontend Testing

The frontend uses Vitest and React Testing Library for component testing.

The testing environment includes:

* Vitest as the test runner
* jsdom as the browser environment
* React Testing Library for React component rendering
* Testing Library DOM matchers for DOM-specific assertions

Frontend tests are kept separately from the application source code:

```text
frontend/tests/
├── setup.ts
└── components/
    └── layout/
        └── AppShell.test.tsx
```

The initial application shell test covers:

* Application shell rendering
* Navigation elements
* Header content
* Main content rendering

Additional component tests can be added to the corresponding directories as the frontend grows.

---

## ✨ Frontend Code Quality

The frontend uses TypeScript, ESLint, and Prettier to maintain type safety, code quality, and consistent formatting.

### 🔷 TypeScript

TypeScript is configured with strict type checking enabled.

Run TypeScript validation:

```bash
npm run typecheck
```

### 🔍 ESLint

ESLint is configured with TypeScript and React-specific rules to enforce frontend code quality.

Run ESLint:

```bash
npm run lint
```

### 🎨 Formatting

Prettier is used to maintain consistent code formatting.

Format the frontend code:

```bash
npm run format
```

Check formatting without modifying files:

```bash
npm run format:check
```

### ✅ Code Quality Checks

Before submitting frontend changes, the following checks should pass:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

These checks ensure TypeScript validation, ESLint rules, consistent formatting, and a successful production build.

---

## 🚦 Status

🚧 In development
