# cucumber-ruby-complex — Payment Processing Platform BDD Example

A complete, realistic **Cucumber + Ruby** BDD test suite for a payment processing
platform. This project demonstrates how the **api-test-coverage-analyzer** resolves
API endpoint coverage through multiple indirection layers, from human-readable
Gherkin scenarios all the way down to actual HTTP calls.

---

## Table of Contents

1. [Project Purpose](#project-purpose)
2. [How the Analyzer Resolves Endpoints](#how-the-analyzer-resolves-endpoints)
3. [Directory Structure](#directory-structure)
4. [API Endpoints Covered](#api-endpoints-covered)
5. [Business Rules](#business-rules)
6. [Integration Flows](#integration-flows)
7. [Running the Tests](#running-the-tests)
8. [Running the Coverage Analyzer](#running-the-coverage-analyzer)
9. [CI / CD](#ci--cd)
10. [Tags Reference](#tags-reference)

---

## Project Purpose

Standard code-coverage tools measure which lines of Ruby are executed during
tests. They cannot tell you **which API endpoints your BDD suite exercises**.
The api-test-coverage-analyzer fills this gap by performing **static analysis**
of the full resolution chain and producing an endpoint coverage report that maps
each Gherkin scenario to the OpenAPI operations it exercises.

---

## How the Analyzer Resolves Endpoints

The analyzer traces a four-layer call chain. No runtime execution is required.

```
Layer 1 — Gherkin Feature File
  features/payments.feature
    Scenario: Successful payment capture
      When I capture the payment
          │
          │ step text matched by
          ▼
Layer 2 — Step Definition
  features/step_definitions/payment_steps.rb
    When("I capture the payment") do
      payment_id = @last_payment["payment_id"]
      @response = PaymentApiHelper.capture_payment(payment_id)
    end
          │
          │ method call resolved to
          ▼
Layer 3 — API Helper Class
  features/support/api_helper.rb
    class PaymentApiHelper
      def self.capture_payment(id, amount: nil)
        path = PathConstants::PAYMENT_CAPTURE_PATH.gsub(":id", id.to_s)
        ApiClient.post(path, body: {})
      end
    end
          │
          │ constant reference resolved to
          ▼
Layer 4 — Path Constant
  features/support/path_constants.rb
    module PathConstants
      PAYMENT_CAPTURE_PATH = "/payments/:id/capture"
    end
          │
          │ :id → {id} (colon-style → OpenAPI brace-style)
          ▼
Resolved Call: POST /payments/{id}/capture
          │
          │ matched against
          ▼
OpenAPI Spec (openapi.yaml):
  paths:
    /payments/{id}/capture:
      post:
        operationId: capturePayment
```

The analyzer performs this resolution for **every** When/Then step in every
`.feature` file, then computes what percentage of the operations declared in
`openapi.yaml` are exercised.

### Key resolution mechanisms

| Mechanism | File | How it works |
|---|---|---|
| Gherkin step matching | `features/**/*.feature` | Step text matched to `When`/`Then` regex in step definition files |
| Ruby method call tracing | `features/step_definitions/*.rb` | Static AST analysis follows method calls to helper classes |
| PathConstants expansion | `features/support/path_constants.rb` | Constant values read directly; `:param` notation converted to `{param}` |
| HTTP verb detection | `features/support/api_helper.rb` | `ApiClient.get()`, `.post()`, `.put()`, `.patch()`, `.delete()` calls are matched |
| OpenAPI matching | `openapi.yaml` | Resolved `(verb, path)` pairs matched against spec operations |

---

## Directory Structure

```
cucumber-ruby-complex/
│
├── features/                       # All Cucumber BDD content
│   │
│   ├── payments.feature            # Payment auth, capture, void, list, idempotency
│   ├── refunds.feature             # Full/partial refunds, business rule enforcement
│   ├── webhooks.feature            # Webhook registration, HMAC validation
│   ├── account_management.feature  # Account details, balance, limits
│   ├── disputes.feature            # Dispute lifecycle, response window
│   ├── security_scenarios.feature  # Auth, authz, rate limiting, admin endpoints
│   ├── error_scenarios.feature     # 4xx/5xx error handling, state machine validation
│   │
│   ├── step_definitions/
│   │   ├── payment_steps.rb        # When/Given/Then for payment scenarios
│   │   ├── refund_steps.rb         # Step defs for refund scenarios
│   │   ├── webhook_steps.rb        # Step defs for webhook scenarios
│   │   ├── account_steps.rb        # Step defs for account scenarios
│   │   ├── dispute_steps.rb        # Step defs for dispute scenarios
│   │   └── common_steps.rb         # Shared steps (auth, HTTP status, error assertions)
│   │
│   └── support/
│       ├── path_constants.rb       # URL template constants (KEY to analyzer resolution)
│       ├── api_helper.rb           # HTTP helper classes + WebhookValidator + AuthHelper
│       ├── env.rb                  # Cucumber bootstrap, requires, test helpers
│       └── hooks.rb                # Before/After hooks, VCR integration, cleanup
│
├── app/
│   └── routes.rb                   # Sinatra server implementing all API endpoints
│
├── openapi.yaml                    # OpenAPI 3.0.3 spec (source of truth for endpoints)
├── config.yaml                     # Analyzer configuration (test dir, helpers, thresholds)
├── business-rules.yaml             # Business constraints with endpoint + scenario mappings
├── integration-flows.yaml          # Multi-step workflow definitions (FLOW001–FLOW005)
├── Gemfile                         # Ruby dependencies
│
├── .github/
│   └── workflows/
│       └── analyze.yml             # GitHub Actions: run tests then analyzer
│
├── Jenkinsfile                     # Jenkins declarative pipeline
└── README.md                       # This file
```

---

## API Endpoints Covered

The BDD suite exercises the following 18 endpoints (all declared in `openapi.yaml`):

| Method | Path | Feature | Helper Method |
|--------|------|---------|---------------|
| POST | `/payments` | payments.feature | `PaymentApiHelper.create_payment` |
| GET | `/payments` | payments.feature | `PaymentApiHelper.list_payments` |
| GET | `/payments/{id}` | payments.feature | `PaymentApiHelper.get_payment` |
| POST | `/payments/{id}/capture` | payments.feature | `PaymentApiHelper.capture_payment` |
| POST | `/payments/{id}/void` | payments.feature | `PaymentApiHelper.void_payment` |
| POST | `/payments/{id}/refund` | refunds.feature | `PaymentApiHelper.refund_payment` |
| POST | `/refunds` | refunds.feature | `RefundApiHelper.create_refund` |
| GET | `/refunds/{id}` | refunds.feature | `RefundApiHelper.get_refund` |
| POST | `/disputes` | disputes.feature | `DisputeApiHelper.create_dispute` |
| GET | `/disputes` | disputes.feature | `DisputeApiHelper.list_disputes` |
| GET | `/disputes/{id}` | disputes.feature | `DisputeApiHelper.get_dispute` |
| PUT | `/disputes/{id}/respond` | disputes.feature | `DisputeApiHelper.respond_to_dispute` |
| GET | `/accounts/{id}` | account_management.feature | `AccountApiHelper.get_account` |
| GET | `/accounts/{id}/balance` | account_management.feature | `AccountApiHelper.get_balance` |
| PATCH | `/accounts/{id}/limits` | account_management.feature | `AccountApiHelper.update_limits` |
| POST | `/webhooks` | webhooks.feature | `WebhookApiHelper.create_webhook` |
| GET | `/admin/health` | security_scenarios.feature | `AdminApiHelper.health_check` |
| GET | `/admin/stats` | security_scenarios.feature | `AdminApiHelper.get_stats` |

---

## Business Rules

Seven business rules are enforced and tested. Each is documented in
`business-rules.yaml` and validated by specific Cucumber scenarios.

| Rule ID | Name | Enforced By |
|---------|------|-------------|
| `payment-authorization-before-capture` | Must authorize before capture | `POST /payments/{id}/capture` |
| `void-uncaptured-only` | Can only void authorized payments | `POST /payments/{id}/void` |
| `refund-captured-payments-only` | Refunds require captured payment | `POST /refunds`, `POST /payments/{id}/refund` |
| `refund-amount-not-exceed-original` | Total refunds ≤ original amount | `POST /refunds` |
| `dispute-response-window` | 7-day window to respond to disputes | `PUT /disputes/{id}/respond` |
| `account-active-for-payments` | Account must be active | `POST /payments` |
| `webhook-signature-validation` | HMAC-SHA256 required on webhooks | Client validation |

---

## Integration Flows

Five multi-step flows are defined in `integration-flows.yaml`, linking individual
API calls into coherent business workflows:

| Flow ID | Name | Endpoints |
|---------|------|-----------|
| FLOW001 | Full Payment Lifecycle | POST /payments → POST /capture → POST /refunds → GET /refunds/{id} |
| FLOW002 | Payment Void Flow | POST /payments → POST /void |
| FLOW003 | Dispute Resolution | POST /disputes → GET /disputes/{id} → PUT /respond |
| FLOW004 | Account Balance Management | GET /accounts/{id} → GET /balance → PATCH /limits |
| FLOW005 | Webhook Event Processing | POST /webhooks → POST /payments → POST /capture |

---

## Running the Tests

### Prerequisites

- Ruby 3.1+
- Bundler (`gem install bundler`)
- Node.js 18+ (for the analyzer)

### Start the test server

```bash
cd examples/cucumber-ruby-complex
bundle install
bundle exec ruby app/routes.rb
# Server starts at http://localhost:4567
```

### Run all feature scenarios

```bash
bundle exec cucumber features/
```

### Run only smoke tests

```bash
bundle exec cucumber --tags "@smoke" features/
```

### Run a specific feature

```bash
bundle exec cucumber features/payments.feature
```

### Run with VCR recording (record HTTP interactions for replay)

```bash
VCR_RECORD=true bundle exec cucumber features/
```

### Run with VCR playback (no live server required)

```bash
VCR_PLAYBACK=true bundle exec cucumber features/
```

---

## Running the Coverage Analyzer

From the repository root:

```bash
# Install analyzer dependencies (once)
npm install

# Run with default config
npx api-test-coverage-analyzer \
  --config examples/cucumber-ruby-complex/config.yaml

# Run with explicit output directory and formats
npx api-test-coverage-analyzer \
  --config examples/cucumber-ruby-complex/config.yaml \
  --output-dir examples/cucumber-ruby-complex/reports/coverage \
  --format json,html,markdown

# Fail if coverage drops below 80%
npx api-test-coverage-analyzer \
  --config examples/cucumber-ruby-complex/config.yaml \
  --fail-under 80
```

### Expected output

```
Payment Processing Platform - Cucumber/Ruby BDD Suite
======================================================
Scanning features/   (7 feature files, 54 scenarios)
Tracing step definitions   (6 files, 89 step patterns)
Resolving PathConstants   (18 URL templates)
Matching against openapi.yaml   (18 operations)

Endpoint Coverage Summary
─────────────────────────────────────
  Covered:    18 / 18 endpoints  (100.0%)
  Uncovered:  0  / 18 endpoints  (0.0%)

Business Rule Coverage
─────────────────────────────────────
  FLOW001 Full Payment Lifecycle       COVERED
  FLOW002 Payment Void Flow            COVERED
  FLOW003 Dispute Resolution           COVERED
  FLOW004 Account Balance Management   COVERED
  FLOW005 Webhook Event Processing     COVERED

Coverage gate: 100.0% >= 80.0%   PASSED
```

---

## CI / CD

### GitHub Actions

The pipeline at `.github/workflows/analyze.yml` runs three jobs:

1. **`smoke_tests`** — fast feedback on PRs (tagged `@smoke` scenarios only)
2. **`cucumber_tests`** — full BDD suite; starts Sinatra, runs all features, publishes reports
3. **`coverage_analysis`** — runs the analyzer against the test results; comments a summary on PRs

### Jenkins

`Jenkinsfile` defines a declarative pipeline with the same stages plus a
**Coverage Gate** stage that reads `reports/coverage/coverage.json` and fails
the build if `endpoint_coverage_percent` is below the configured threshold.

---

## Tags Reference

| Tag | Purpose |
|-----|---------|
| `@smoke` | Core happy-path scenarios; run on every PR for fast feedback |
| `@create` | Scenarios that create new resources |
| `@retrieve` | Scenarios that fetch existing resources |
| `@capture` | Payment capture scenarios |
| `@void` | Payment void scenarios |
| `@refunds` | Refund creation and retrieval |
| `@balance` | Account balance operations |
| `@limits` | Account limit management |
| `@security` | Authentication, authorization, and rate limiting |
| `@webhook_security` | HMAC signature validation scenarios |
| `@admin` | Admin-only endpoint scenarios |
| `@business_rules` | Scenarios that validate business rule enforcement |
| `@negative` | Scenarios testing rejection/error paths |
| `@idempotency` | Duplicate request prevention scenarios |
| `@rate_limiting` | Rate limit enforcement scenarios |
| `@wip` | Work-in-progress; excluded from CI runs |

---

## License

Apache 2.0. See the repository root for the full license text.
