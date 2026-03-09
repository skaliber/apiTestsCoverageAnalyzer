# E-Commerce Orders API — java-spring-complex

A comprehensive Java Spring Boot 3 example project demonstrating how to use the
**api-test-coverage-analyzer** tool to measure and improve REST API test coverage.

This project implements a realistic e-commerce orders platform and includes two test
suites: one with partial coverage (~55%) and one with complete coverage (100%), allowing
you to see the coverage improvement journey end-to-end.

---

## Table of Contents

- [What This Project Is](#what-this-project-is)
- [API Endpoints (18+)](#api-endpoints-18)
- [Business Rules](#business-rules)
- [Running Locally](#running-locally)
- [Running the Tests](#running-the-tests)
- [How the Analyzer Is Integrated](#how-the-analyzer-is-integrated)
- [Running the Analyzer](#running-the-analyzer)
- [Coverage Improvement Journey](#coverage-improvement-journey)
- [CI/CD Integration](#cicd-integration)
- [Project Structure](#project-structure)

---

## What This Project Is

This is a realistic Spring Boot 3 / Java 21 REST API for an e-commerce platform. It serves as
a demonstration project for the `api-test-coverage-analyzer` tool, showing:

1. How to configure the analyzer with `config.yaml`, `business-rules.yaml`, and `integration-flows.yaml`
2. How partial test suites leave coverage gaps the analyzer can detect
3. How comprehensive test suites achieve 100% endpoint, business-rule, and integration-flow coverage
4. How to integrate the analyzer into GitHub Actions and Jenkins CI pipelines

The API manages the full lifecycle of e-commerce operations: user accounts, product catalog,
orders, payments, refunds, shipments, product reviews, and admin operations.

---

## API Endpoints (18+)

### Users
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/users` | Register a new user account | Public |
| GET | `/users` | List all users (paginated) | ADMIN |
| GET | `/users/{id}` | Get user by ID | Owner or ADMIN |
| PUT | `/users/{id}` | Update user profile | Owner or ADMIN |
| DELETE | `/users/{id}` | Delete user account | ADMIN only |

### Products
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/products` | Browse products (filterable, sortable) | Public |
| POST | `/products` | Create new product | ADMIN |
| GET | `/products/{id}` | Get product details | Public |
| PUT | `/products/{id}` | Update product details | ADMIN |
| DELETE | `/products/{id}` | Soft-delete product | ADMIN |
| GET | `/products/{id}/reviews` | Get product reviews | Public |

### Orders
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/orders` | Create new order | Authenticated |
| GET | `/orders` | List user's orders | Authenticated |
| GET | `/orders/{id}` | Get order details | Owner |
| PUT | `/orders/{id}/status` | Update order status | Owner/ADMIN |
| DELETE | `/orders/{id}` | Cancel order | Owner |
| POST | `/orders/{id}/items` | Add item to order | Owner |
| DELETE | `/orders/{id}/items/{itemId}` | Remove item from order | Owner |

### Payments
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/payments` | Initiate payment | Authenticated |
| GET | `/payments/{id}` | Get payment details | Owner |
| POST | `/payments/{id}/capture` | Capture authorized payment | Owner |
| POST | `/payments/{id}/void` | Void authorized payment | Owner |

### Refunds
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/refunds` | Request a refund | Authenticated |
| GET | `/refunds/{id}` | Get refund details | Owner |

### Shipments
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/shipments/{id}` | Get shipment tracking | Owner |
| PUT | `/shipments/{id}/status` | Update shipment status | ADMIN |

### Reviews
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/reviews` | Submit a product review | Authenticated |

### Admin
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/health` | System health check | ADMIN |
| GET | `/admin/metrics` | System metrics (JVM + business) | ADMIN |

**Total: 26 endpoints**

---

## Business Rules

The following business rules are defined in [`business-rules.yaml`](./business-rules.yaml)
and validated by the analyzer against the test suite:

| Rule ID | Description |
|---------|-------------|
| `only-authenticated-users-can-place-orders` | Valid JWT required to place orders |
| `inventory-check-before-order` | Product stock must be >= requested quantity |
| `payment-required-before-shipment` | Payment must be CAPTURED before marking SHIPPED |
| `refund-window-30-days` | Refunds allowed only within 30 days of payment capture |
| `user-deletion-requires-admin` | Only ADMIN role can delete user accounts |
| `duplicate-order-prevention` | Idempotency-Key header prevents duplicate orders |
| `max-order-amount-10000` | Single order total cannot exceed $10,000 |
| `review-requires-completed-order` | Reviewer must have a DELIVERED order for the product |

---

## Running Locally

### Prerequisites

- Java 21+
- Node.js 20+ (for the analyzer)
- Gradle (wrapper included — no separate install needed)

### Start the application

```bash
cd examples/java-spring-complex
./gradlew bootRun
```

The API will start on `http://localhost:8080`.

H2 console (development only): `http://localhost:8080/h2-console`
Swagger UI: `http://localhost:8080/swagger-ui.html`
OpenAPI JSON: `http://localhost:8080/v3/api-docs`

### Environment / configuration

All configuration lives in [`src/main/resources/application.properties`](./src/main/resources/application.properties).
Key settings:

```properties
jwt.secret=<change-in-production>
jwt.expiration.ms=86400000
business.max-order-amount=10000.00
business.refund-window-days=30
```

---

## Running the Tests

### Run all tests (complete suite)

```bash
cd examples/java-spring-complex
./gradlew test
```

### Run only the initial (partial) test suite

```bash
./gradlew testInitial
```

### Run only the complete test suite

```bash
./gradlew testComplete
```

### View test results

HTML report: `build/reports/tests/test/index.html`
JUnit XML: `build/test-results/test/*.xml`

---

## How the Analyzer Is Integrated

The analyzer is configured via three YAML files:

### `config.yaml` — Main analyzer configuration

Specifies the OpenAPI spec location, test directory, coverage thresholds, and output format.
The quality gate is enabled with `failBuildOnThresholdMiss: true`, meaning the CI pipeline
will fail if any threshold is not met.

### `business-rules.yaml` — Business rule definitions

Defines each business rule with its associated endpoints and test keywords. The analyzer
scans test files for these keywords to verify each rule has test coverage.

### `integration-flows.yaml` — Integration flow definitions

Defines multi-step integration flows (e.g., the complete order lifecycle). The analyzer
checks that test files cover the endpoints involved in each flow.

---

## Running the Analyzer

### One-time setup

```bash
npm install -g api-test-coverage-analyzer
# or without global install:
npx api-test-coverage-analyzer --version
```

### Analyze complete tests (should show 100% coverage)

```bash
cd examples/java-spring-complex
api-coverage analyze \
  --config config.yaml \
  --testDir src/test/java/com/example/orders/tests-complete \
  --outputDir reports/complete \
  --format json,html
```

### Analyze initial tests (shows partial coverage)

```bash
api-coverage analyze \
  --config config.yaml \
  --testDir src/test/java/com/example/orders/tests-initial \
  --outputDir reports/initial \
  --format json,html \
  --no-fail-on-threshold
```

### View reports

Open `reports/complete/index.html` in a browser to see the interactive HTML report.

### Using npx (no global install)

```bash
npx api-test-coverage-analyzer analyze \
  --config config.yaml \
  --outputDir reports/complete
```

---

## Coverage Improvement Journey

This project demonstrates a three-phase coverage improvement workflow:

### Phase A: Initial State (~55% coverage)

The `tests-initial/` directory contains a realistic partial test suite that covers only
the happy paths for users and orders:

- POST /users (create)
- GET /users/{id}
- PUT /users/{id}
- POST /orders
- GET /orders
- GET /orders/{id}
- DELETE /orders/{id}

**What's missing:**
- GET /users (admin list) and DELETE /users/{id}
- PUT /orders/{id}/status, POST/DELETE order items
- All payment endpoints
- All refund endpoints
- All shipment status endpoints
- POST /reviews
- All admin endpoints
- Error paths (400, 403, 409, 422 responses)
- Business rule coverage

**Run the analyzer to see the gaps:**

```bash
api-coverage analyze \
  --config config.yaml \
  --testDir src/test/java/com/example/orders/tests-initial \
  --outputDir reports/initial \
  --no-fail-on-threshold
```

### Phase B: Analyze and Identify Gaps

The analyzer generates a detailed report showing:

- Which endpoints have no test coverage
- Which business rules have no corresponding tests
- Which integration flow steps are untested
- Which error response codes (400, 401, 403, 404, 422) are missing

Example output (partial):
```
MISSING ENDPOINT COVERAGE:
  GET    /users                  (0% - 0/3 scenarios)
  DELETE /users/{id}             (0% - 0/4 scenarios)
  POST   /payments               (0%)
  POST   /payments/{id}/capture  (0%)
  ...

MISSING BUSINESS RULE COVERAGE:
  refund-window-30-days         (0 tests found)
  payment-required-before-shipment (0 tests found)
  ...
```

Use this output to write targeted tests.

### Phase C: Complete Tests (100% coverage)

The `tests-complete/` directory contains the full test suite:

- 8 test files covering all 26 endpoints
- All 8 business rules tested including error cases
- All 5 integration flows covered
- All HTTP error response codes tested (400, 401, 403, 404, 409, 422)
- Security scenarios (unauthenticated, unauthorized, cross-user access)

**Verify full coverage:**

```bash
api-coverage analyze \
  --config config.yaml \
  --testDir src/test/java/com/example/orders/tests-complete \
  --outputDir reports/complete
```

Expected result:
```
Endpoint Coverage:         100% (PASS)
Parameter Coverage:         85% (PASS)
Business Rule Coverage:    100% (PASS)
Integration Flow Coverage: 100% (PASS)
Error Path Coverage:        92% (PASS)
Security Coverage:          95% (PASS)

Quality Gate: PASSED
```

---

## CI/CD Integration

### GitHub Actions

See [`.github/workflows/analyze.yml`](.github/workflows/analyze.yml).

The workflow:
1. Checks out code
2. Sets up Java 21 and Node.js 20
3. Builds with Gradle
4. Runs tests
5. Installs `api-test-coverage-analyzer`
6. Runs analysis on both test suites
7. Uploads HTML/JSON reports as artifacts
8. Publishes a summary table to the GitHub Actions step summary
9. Posts a coverage comment on pull requests

### Jenkins

See [`Jenkinsfile`](./Jenkinsfile).

Pipeline stages:
1. Checkout
2. Build (Gradle)
3. Test (JUnit reports published)
4. Analyze API Coverage (parallel: complete + initial baseline)
5. Coverage Summary (prints report, fails build if quality gate not met)
6. Archive Reports (HTML reports published via `publishHTML`)

---

## Project Structure

```
java-spring-complex/
  src/
    main/java/com/example/orders/
      controller/          REST controllers for all resources
      service/             Business logic layer
      repository/          JPA repository interfaces
      model/               JPA entity classes
      config/              Spring Security configuration
      OrdersApplication.java
    resources/
      application.properties
  src/
    test/java/com/example/orders/
      tests-initial/       Partial test suite (~55% coverage)
      tests-complete/      Full test suite (100% coverage)
  openapi.yaml             OpenAPI 3.0 specification (26 endpoints)
  config.yaml              Analyzer configuration
  business-rules.yaml      8 business rules with test assertions
  integration-flows.yaml   5 integration flow definitions
  build.gradle             Spring Boot 3 + Java 21 Gradle build
  .github/
    workflows/
      analyze.yml          GitHub Actions CI pipeline
  Jenkinsfile              Jenkins declarative pipeline
  README.md                This file
```
