# python-fastapi-complex

A realistic **Financial Accounts & Transactions API** built with FastAPI, used as an example project for the [apiTestsCoverageAnalyzer](https://github.com/q-intel/apiTestsCoverageAnalyzer).

This project demonstrates the complete coverage improvement journey: starting with a partial test suite (~55% coverage), discovering gaps with the analyzer, and iteratively adding tests until 100% coverage is achieved.

---

## Domain: Financial Accounts Platform

The API manages:

| Resource | Endpoints |
|---|---|
| Auth | POST /auth/token, POST /auth/refresh |
| Accounts | POST/GET /accounts, GET/PUT/DELETE /accounts/{id}, GET /accounts/{id}/balance, GET /accounts/{id}/summary |
| Transactions | POST/GET /transactions, GET /transactions/{id} |
| Transfers | POST /transfers, GET /transfers/{id} |
| Limits | GET/PUT /limits/{accountId} |
| Statements | GET /statements/{accountId}, GET /statements/{accountId}/{month} |
| Cards | POST /cards, GET/DELETE /cards/{id}, PUT /cards/{id}/status |
| Merchants | GET /merchants, GET /merchants/{id} |
| Admin | GET /admin/health, GET /admin/stats |

**Total: 22 endpoints**

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+ (for the analyzer)
- pip

### Install dependencies

```bash
make install
# or:
pip install -r requirements.txt
```

### Run the API

```bash
make run
# Server starts at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

### Default users (seeded on startup)

| Username | Password | Role |
|---|---|---|
| `alice` | `alice123` | Regular user |
| `bob` | `bob123` | Regular user |
| `admin` | `admin123` | Admin |

---

## Running Tests

```bash
# Run the complete test suite (100% coverage)
make test

# Run only the initial partial test suite
make test-initial

# Run everything (both suites)
make test-all

# Run with Python coverage report
make test-cov
```

---

## Coverage Analysis

### Analyze initial test suite (shows ~55% coverage and gaps)

```bash
make analyze-initial
```

### Analyze complete test suite (shows 100% coverage — quality gate)

```bash
make analyze
```

---

## Project Structure

```
python-fastapi-complex/
  app/
    main.py               FastAPI application entry point; registers all routers
    auth.py               JWT token creation, verification, and FastAPI dependencies
    models.py             Pydantic request/response models for all resources
    database.py           Thread-safe in-memory data store with seed data
    constants.py          URL path constants and domain enums
    helpers/
      api_client.py       Typed client wrappers used in tests (indirect resolution)
      path_builder.py     Functions that build URL paths from parameters
    routers/
      accounts.py         CRUD + balance + summary
      transactions.py     Create and retrieve transactions
      transfers.py        Fund transfers with business rule enforcement
      limits.py           Spending limits per account
      statements.py       Monthly statement retrieval
      cards.py            Card lifecycle management
      merchants.py        Merchant directory
      admin.py            Health check and system stats
  tests/
    tests-initial/        Partial suite (~55% endpoint coverage)
      test_accounts.py
      test_transactions.py
    tests-complete/       Full 100% coverage suite
      test_accounts.py
      test_transactions.py
      test_transfers.py
      test_limits.py
      test_statements.py
      test_cards.py
      test_merchants.py
      test_admin.py
      test_error_scenarios.py
      test_security.py
  openapi.yaml            OpenAPI 3.0 specification (22 endpoints)
  config.yaml             Analyzer configuration
  business-rules.yaml     8 business rules with test mappings
  integration-flows.yaml  5 end-to-end integration flows
  requirements.txt        Python dependencies
  pyproject.toml          Project metadata and tool configuration
  pytest.ini              Pytest configuration
  Makefile                Developer workflow targets
  .github/
    workflows/
      analyze.yml         GitHub Actions CI/CD pipeline
  Jenkinsfile             Jenkins declarative pipeline
```

---

## Coverage Improvement Journey

This project is specifically designed to show how the `apiTestsCoverageAnalyzer` identifies coverage gaps and guides developers toward 100% coverage.

### Step 1 — Start with partial coverage (~55%)

The `tests/tests-initial/` directory contains two test files covering only the **accounts** and **transactions** endpoints.  Run the analyzer to see the gaps:

```bash
make analyze-initial
```

**Expected analyzer output (initial):**

```
Endpoint Coverage:    12 / 22  (54.5%)  FAIL  [threshold: 100%]
Business Rules:        2 / 8   (25.0%)  FAIL  [threshold: 100%]
Integration Flows:     0 / 5   ( 0.0%)  FAIL  [threshold: 100%]
Error Scenarios:       8 / 20  (40.0%)  FAIL  [threshold: 80%]
Security Tests:        4 / 10  (40.0%)  FAIL  [threshold: 80%]

Uncovered endpoints:
  POST    /transfers                          (missing)
  GET     /transfers/{transfer_id}            (missing)
  GET     /limits/{account_id}               (missing)
  PUT     /limits/{account_id}               (missing)
  GET     /statements/{account_id}           (missing)
  GET     /statements/{account_id}/{month}   (missing)
  POST    /cards                             (missing)
  GET     /cards/{card_id}                   (missing)
  PUT     /cards/{card_id}/status            (missing)
  DELETE  /cards/{card_id}                   (missing)
  GET     /merchants                         (missing)
  GET     /merchants/{merchant_id}           (missing)
  GET     /admin/health                      (missing)
  GET     /admin/stats                       (missing)
  POST    /auth/token                        (missing)
  POST    /auth/refresh                      (missing)

Uncovered business rules:
  BR-002: transfer-sufficient-funds          (missing)
  BR-003: daily-transfer-limit               (missing)
  BR-004: card-activation-required           (missing)
  BR-005: account-closure-zero-balance       (missing)
  BR-006: duplicate-transaction-prevention   (missing)
  BR-007: minimum-transfer-amount            (missing)
  BR-008: suspended-account-no-transactions  (missing)
```

### Step 2 — Follow the gap report and add tests iteratively

The analyzer gives you a precise roadmap.  Adding tests in this order closes coverage quickly:

#### Iteration 1 — Add transfer tests

```bash
# Add: tests/tests-complete/test_transfers.py
# Newly covered:
#   POST /transfers            (+1 endpoint)
#   GET  /transfers/{id}       (+1 endpoint)
#   BR-002, BR-007             (+2 business rules)
```

**Coverage after iteration 1:** 14/22 endpoints (63.6%)

#### Iteration 2 — Add limits, statements, cards

```bash
# Add: tests/tests-complete/test_limits.py
# Add: tests/tests-complete/test_statements.py
# Add: tests/tests-complete/test_cards.py
# Newly covered:
#   GET/PUT /limits/{id}                 (+2 endpoints)
#   GET /statements/{id}                 (+1 endpoint)
#   GET /statements/{id}/{month}         (+1 endpoint)
#   POST/GET/PUT/DELETE /cards           (+4 endpoints)
#   BR-004 card-activation-required      (+1 business rule)
```

**Coverage after iteration 2:** 22/22 endpoints (100%), 5/8 business rules (62.5%)

#### Iteration 3 — Add merchants, admin, and auth tests

```bash
# Add: tests/tests-complete/test_merchants.py
# Add: tests/tests-complete/test_admin.py (includes auth endpoint tests)
# Newly covered:
#   GET /merchants, GET /merchants/{id}  (+2 endpoints)
#   GET /admin/health, /admin/stats      (+2 endpoints - already counted)
#   POST /auth/token, /auth/refresh      (+2 endpoints - already counted)
```

#### Iteration 4 — Add error scenarios and security tests

```bash
# Add: tests/tests-complete/test_error_scenarios.py
# Add: tests/tests-complete/test_security.py
# Newly covered:
#   BR-001 account-ownership             (+1 business rule)
#   BR-003 daily-transfer-limit          (+1 business rule)
#   BR-005 account-closure-zero-balance  (+1 business rule)
#   BR-006 duplicate-transaction         (+1 business rule)
#   BR-008 suspended-account             (+1 business rule)
#   All integration flows                (+5 flows)
#   All security scenarios               (+10 tests)
```

### Step 3 — Verify 100% coverage

```bash
make analyze
```

**Expected analyzer output (complete):**

```
Endpoint Coverage:    22 / 22  (100%)  PASS
Business Rules:        8 / 8   (100%)  PASS
Integration Flows:     5 / 5   (100%)  PASS
Error Scenarios:      20 / 20  (100%)  PASS
Security Tests:       13 / 13  (100%)  PASS

Quality Gate: PASSED
```

---

## Business Rules

| ID | Name | Enforced On |
|---|---|---|
| BR-001 | account-ownership | GET/PUT/DELETE /accounts/{id}, limits, statements |
| BR-002 | transfer-sufficient-funds | POST /transfers |
| BR-003 | daily-transfer-limit | POST /transfers |
| BR-004 | card-activation-required | PUT /cards/{id}/status |
| BR-005 | account-closure-zero-balance | DELETE /accounts/{id} |
| BR-006 | duplicate-transaction-prevention | POST /transactions |
| BR-007 | minimum-transfer-amount | POST /transfers ($1.00 minimum) |
| BR-008 | suspended-account-no-transactions | POST /transactions, POST /transfers |

---

## Integration Flows

| ID | Name | Steps |
|---|---|---|
| FLOW001 | Account Opening and First Transaction | auth → create account → credit → verify balance |
| FLOW002 | Fund Transfer Between Accounts | auth → check balance → transfer → verify both balances |
| FLOW003 | Card Lifecycle Management | auth → issue → activate → suspend → cancel |
| FLOW004 | Monthly Statement Retrieval | auth → list periods → get monthly statement |
| FLOW005 | Account Closure Process | auth → transfer funds out → verify zero balance → close |

---

## Test Patterns

This project demonstrates two URL-resolution test patterns that the analyzer understands:

### Pattern 1: Direct URL literals in tests

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_account(token):
    response = client.post("/accounts", json={"account_type": "checking"}, ...)
    assert response.status_code == 201
```

### Pattern 2: URL constants resolved indirectly

```python
from app.helpers.path_builder import accounts_path, account_path

def test_list_accounts(token):
    resp = client.get(accounts_path(), headers={"Authorization": f"Bearer {token}"})
    # accounts_path() returns "/accounts"

def test_get_account(token, account_id):
    resp = client.get(account_path(account_id), ...)
    # account_path(account_id) resolves to "/accounts/{account_id}"
```

### Pattern 3: Wrapper client methods

```python
from app.helpers.api_client import AccountsClient, AuthClient

auth = AuthClient(client)
accounts = AccountsClient(client)

def test_end_to_end():
    token = auth.get_token("alice", "alice123")
    resp = accounts.create_account({"account_type": "checking"}, token)
    # AccountsClient.create_account() calls client.post(ACCOUNTS_URL, ...)
```

Both Pattern 2 and Pattern 3 exercise the analyzer's **indirect endpoint resolution** capability — resolving endpoint coverage even when URL strings are not hardcoded directly in the test body.

---

## CI/CD

### GitHub Actions

The workflow (`.github/workflows/analyze.yml`) runs four jobs:

1. **test-initial** — pytest on `tests/tests-initial/` (expected ~55% coverage)
2. **analyze-initial** — analyzer on initial suite; produces gap report (no failure)
3. **test-complete** — pytest on `tests/tests-complete/` (must pass 100%)
4. **analyze-complete** — analyzer on complete suite with quality gate enforced

### Jenkins

The `Jenkinsfile` mirrors the same pipeline structure using declarative syntax:

1. `Setup: Python` — `pip install -r requirements.txt`
2. `Setup: Node.js` — install Node 20 for the analyzer
3. `Test: Initial Suite` — pytest initial, JUnit results published
4. `Analyze: Initial Coverage (Gap Report)` — runs analyzer, no threshold failure
5. `Test: Complete Suite` — pytest complete suite, JUnit results published
6. `Analyze: Complete Coverage (Quality Gate)` — analyzer enforces thresholds

---

## Configuration

### config.yaml thresholds

```yaml
thresholds:
  endpoint: 100    # Every endpoint must be tested
  parameter: 80    # 80% of parameters must be exercised
  business: 100    # Every business rule must be covered
  integration: 100 # Every integration flow must be covered
  error: 80        # 80% of error scenarios must be tested
  security: 80     # 80% of security scenarios must be tested
```

Modify these values to suit your team's quality requirements.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-improvement`
3. Make your changes, run `make test` and `make analyze`
4. Submit a pull request

---

## License

MIT License. See [LICENSE](../../LICENSE) for details.
