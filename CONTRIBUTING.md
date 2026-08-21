# Contributing to Idemerax

Thank you for contributing to **Idemerax**.

This document defines the repository conventions, contribution workflow, and development standards used to maintain consistent, reliable, and maintainable development.

---

## 📌 Branch Naming

Branches use a short, descriptive **kebab-case** name based on the overall purpose of the work item.

### Format

```text
<short-description>
```

### Branch Rules

- Branch names must use lowercase characters.
- Words must be separated using hyphens (`-`).
- Branch names must not contain spaces.
- Branch names should be concise and descriptive.
- A branch should normally represent one focused work item.
- The branch name should describe the overall purpose of the work item.
- Branch names must not use type prefixes.

### Examples

```text
transaction-idempotency
duplicate-transaction-processing
transaction-recovery
repository-contribution-standards
establish-repository-contribution-standards
```

---

## 📝 Commit Messages

Commit messages follow the **Conventional Commits** format.

### Format

```text
<type>[optional scope]: <description>
```

### Commit Types

| Type | Purpose |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior changes |
| `test` | Tests |
| `docs` | Documentation |
| `ci` | CI/CD configuration |
| `build` | Build system or dependency changes |
| `chore` | Maintenance tasks |
| `perf` | Performance improvements |
| `security` | Security-related changes |

### Commit Rules

- A commit type prefix is required.
- Commit type prefixes must be lowercase.
- Commit descriptions should use lowercase wording where technically appropriate.
- Technical names such as `PostgreSQL`, `FastAPI`, `React`, and `TypeScript` retain their correct capitalization.
- Commit messages should be concise and descriptive.
- Each commit should represent one logical change.
- Unrelated changes should not be combined into the same commit.
- Commit messages should use imperative wording.
- Commit messages should not end with a period.
- Unnecessary formatting and punctuation should be avoided.

### ✅ Valid Examples

```text
feat: add transaction idempotency
fix: prevent duplicate transaction processing
test: add transaction consistency tests
docs: document transaction lifecycle
ci: add commit message validation
refactor: simplify transaction repository
chore: update development tooling
security: improve security reporting
```

### ❌ Invalid Examples

```text
Feat: Add Transaction Idempotency
FEAT: add transaction idempotency
feat Add transaction idempotency
feat: Added transaction idempotency.
add transaction idempotency
```

---

## 🎫 Issue Titles

Issue titles use a type prefix followed by a concise description.

### Format

```text
<type>: <description>
```

### Issue Types

| Type | Purpose |
|---|---|
| `feat` | New functionality |
| `fix` | Bug reports and defect resolution |
| `refactor` | Structural improvements |
| `test` | Testing-related work |
| `docs` | Documentation |
| `ci` | CI/CD and automation |
| `chore` | Maintenance and repository work |
| `security` | Security-related work |

### Issue Rules

- A type prefix is required.
- Type prefixes must be lowercase.
- Descriptions should use lowercase wording where technically appropriate.
- Technical names retain their correct capitalization.
- Titles should be concise and clearly describe the primary purpose of the issue.

### Examples

```text
feat: implement transaction recovery
fix: prevent duplicate transaction processing
test: add transaction consistency tests
docs: document transaction lifecycle
ci: improve continuous integration
security: improve authentication handling
```

---

## 🔀 Pull Request Titles

Pull Request titles follow the same convention as issue titles and commit messages.

### Format

```text
<type>: <description>
```

### Pull Request Rules

- A type prefix is required.
- The type prefix must be lowercase.
- The description should use lowercase wording where technically appropriate.
- The title should clearly describe the primary purpose of the Pull Request.
- Technical names retain their correct capitalization.

### Examples

```text
feat: implement transaction idempotency
fix: prevent duplicate transaction processing
docs: establish contribution standards
ci: add commit message validation
```

---

## 🔄 Contribution Workflow

All contributions should follow the repository development workflow.

1. Start from the latest `staging` branch.
2. Create a dedicated branch for the work item.
3. Implement the required changes.
4. Create focused commits using the defined commit message convention.
5. Run the relevant tests and quality checks.
6. Push the branch to the remote repository.
7. Open a Pull Request targeting `staging`.
8. Complete the Pull Request description and checklist.
9. Address review feedback and required changes.
10. Ensure all required checks pass.
11. Merge the Pull Request after approval and successful validation.

---

## 🛠️ Development Workflow

The standard development flow is:

```text
staging
   │
   ▼
Create work branch
   │
   ▼
Implement changes
   │
   ▼
Create focused commits
   │
   ▼
Run tests & quality checks
   │
   ▼
Push branch
   │
   ▼
Pull Request → staging
   │
   ▼
Review
   │
   ▼
Required checks pass
   │
   ▼
Merge
```

### Work Item Scope

A single work item may contain multiple logical changes.

These changes may require different commit types while remaining part of the same branch and Pull Request.

Example:

```text
Branch:
transaction-recovery

Commits:
feat: add transaction recovery
test: add transaction recovery tests
docs: document transaction recovery
```

The **branch represents the overall work item**, while each **commit represents a specific logical change**.

Commits should not be created solely to increase commit count.

---

## 🔀 Pull Requests

Pull Requests should:

- Target the `staging` branch.
- Have a clear and descriptive title.
- Describe the purpose and scope of the change.
- Explain relevant implementation details.
- Include testing information.
- Identify relevant architectural or behavioral changes.
- Include documentation updates when required.
- Complete the Pull Request checklist.
- Pass all required automated checks.
- Remain focused on the corresponding work item.

Unrelated changes should not be included in a Pull Request.

---

## 🧪 Testing

Changes should include appropriate tests when applicable.

### Backend

Relevant backend checks include:

```text
pytest
ruff
coverage
```

### Frontend

Relevant frontend checks include:

```text
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

### Testing Expectations

- New functionality should include appropriate test coverage.
- Bug fixes should include regression coverage where appropriate.
- Changes to transaction processing should consider consistency, failure handling, and recovery behavior.
- Relevant tests should pass before opening a Pull Request.

---

## ✨ Code Quality

Code should follow the project's configured formatting, linting, type checking, and testing rules.

Before submitting a Pull Request, contributors should run the relevant quality checks for the affected project area.

Pull Requests should not be submitted with known failing required checks unless the failure is explicitly documented and understood.

---

## 📚 Documentation

Changes affecting any of the following should include corresponding documentation updates when necessary:

- Architecture
- Application behavior
- Development workflows
- Repository conventions
- Reliability behavior
- Security processes

Documentation should remain consistent with the current implementation.

---

## 📦 Dependencies

Dependencies should only be added or updated when required by the implementation.

Dependency changes should be reviewed for:

- Compatibility
- Security
- Maintenance impact
- License considerations where applicable

Automated dependency updates should be reviewed before merging.

---

## 🔐 Security

Security vulnerabilities must **not** be reported through public Issues or Pull Requests.

Security vulnerabilities should be reported according to the process documented in [`SECURITY.md`](SECURITY.md).

Do not disclose the following through public repository discussions:

- Credentials
- Authentication tokens
- Private data
- Sensitive configuration
- Exploitable vulnerability details

---

## 🤝 General Guidelines

Contributors should:

- Keep changes focused.
- Follow the existing project architecture.
- Follow established naming conventions.
- Add or update tests when behavior changes.
- Update documentation when required.
- Avoid unrelated changes.
- Keep commits logically focused.
- Keep Pull Requests reviewable.
- Consider reliability, data integrity, and failure handling when modifying transaction-related functionality.

---

## ✅ Before Opening a Pull Request

Before opening a Pull Request, verify that:

- [ ] The branch follows the repository naming convention.
- [ ] Commit messages follow the defined convention.
- [ ] Relevant tests pass.
- [ ] Relevant linting and formatting checks pass.
- [ ] Type checking passes where applicable.
- [ ] Documentation has been updated where necessary.
- [ ] The Pull Request title follows the defined convention.
- [ ] The Pull Request description is complete.
- [ ] No unrelated changes are included.
- [ ] No sensitive information has been committed.

---

## 📖 Further Documentation

Additional project documentation can be found in the [`docs/`](docs/) directory.

For security vulnerability reporting, see [`SECURITY.md`](SECURITY.md).
