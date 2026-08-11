# Project Conventions

## Python Naming

The project follows standard Python naming conventions.

### Files and Modules

Files and modules use `snake_case`.

Example:

```text
transaction_service.py
```

### Classes

Classes use `PascalCase`.

Example:

```text
TransactionProcessor
```

### Functions and Variables

Functions and variables use `snake_case`.

Examples:

```text
create_transaction()
account_balance
```

### Constants

Constants use `UPPER_SNAKE_CASE`.

Example:

```text
MAX_RETRY_COUNT
```

---

## Project Structure Naming

Directories should use lowercase names and have clear, well-defined responsibilities.

Examples:

```text
domain
application
infrastructure
repositories
schemas
```

---

## Test Naming

Test files and test functions should clearly describe the functionality or behavior being tested.

### Test Files

Test files use the following format:

```text
test_<feature>.py
```

Example:

```text
test_transactions.py
```

### Test Functions

Test functions use the following format:

```text
test_<expected_behavior>()
```

Example:

```text
test_transaction_fails_when_balance_is_insufficient()
```
