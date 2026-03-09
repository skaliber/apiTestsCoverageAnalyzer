# Example Projects

The `examples/` directory contains **eight realistic, non-trivial API projects** that demonstrate the analyzer in action across different languages, frameworks, and CI environments.

Every example:
- Has 15–20+ API endpoints across multiple resources
- Includes OpenAPI spec, business rules, integration flows, and analyzer config
- Demonstrates iterative coverage improvement from ~50% to 100%
- Includes GitHub Actions and Jenkins CI examples

---

## Overview Table

| Example | Language | Framework | Endpoints | Deep Resolution | Business Rules | Cucumber |
|---------|----------|-----------|-----------|----------------|---------------|----------|
| [typescript](#typescript) | TypeScript | Express | 13 | ✓ | ✓ | — |
| [java-spring-complex](#java-spring-complex) | Java | Spring Boot | 18+ | ✓ (enums, constants, wrappers) | ✓ | — |
| [python-fastapi-complex](#python-fastapi-complex) | Python | FastAPI | 18+ | ✓ (constants, path builders) | ✓ | — |
| [ruby-rails-complex](#ruby-rails-complex) | Ruby | Rails API | 18+ | ✓ (helpers, abstractions) | ✓ | — |
| [cucumber-ruby-complex](#cucumber-ruby-complex) | Ruby | Sinatra + Cucumber | 16+ | ✓ (BDD layer) | ✓ | ✓ |
| [cucumber-java-complex](#cucumber-java-complex) | Java | Cucumber + RestAssured | 18+ | ✓ (BDD + PathConstants) | ✓ | ✓ |
| [kotlin-ktor-complex](#kotlin-ktor-complex) | Kotlin | Ktor | 18+ | ✓ (ApiPaths, RequestBuilder) | ✓ | — |
| [javascript-node-express-complex](#javascript-node-express-complex) | JavaScript | Node + Express | 20+ | ✓ (route constants, wrapper client) | ✓ | — |

---

## typescript

> **Location:** `examples/typescript/`
> **Domain:** Wallets & Payments API

The original TypeScript example. A mature, full-featured reference with an observability stack.

- **Endpoints:** 13 (wallets, payments, transactions)
- **Tests:** 4 layers — unit, integration, blackbox, WireMock/nock
- **Intentional gaps** to demonstrate intelligence findings
- **Observability:** Prometheus + Grafana stack

See the full walkthrough in [TypeScript Example →](./typescript-example.md)

```bash
cd examples/typescript
npm install && npm test
npm run analyze
```

---

## java-spring-complex

> **Location:** `examples/java-spring-complex/`
> **Domain:** E-Commerce Orders Platform

A Spring Boot 3 REST API covering the full lifecycle of an e-commerce platform.

**Endpoints (18+):**
```
POST/GET        /users
GET/PUT/DELETE  /users/{id}
GET/POST        /products, /products/{id}
POST/GET/DELETE /orders, /orders/{id}
POST/DELETE     /orders/{id}/items
POST/GET        /payments, /payments/{id}/capture, /payments/{id}/void
POST/GET        /refunds
GET/PUT         /shipments/{id}/status
POST/GET        /reviews, /products/{id}/reviews
GET             /admin/health, /admin/metrics
```

**Deep analysis features exercised:**
- Constants (`ORDER_BASE_URL = "/orders"`)
- Enums (`Endpoint.PAYMENTS`)
- Helper/wrapper methods (`paymentApiHelper.createPayment(...)`)
- Indirect endpoint resolution through service layers

**Coverage journey:**
- `tests-initial/` — ~55% endpoint coverage showing realistic gaps
- `tests-complete/` — 100% coverage including error paths, auth checks, business rules

```bash
cd examples/java-spring-complex
./gradlew test                    # run complete test suite
./gradlew analyze                 # run coverage analyzer
```

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## python-fastapi-complex

> **Location:** `examples/python-fastapi-complex/`
> **Domain:** Financial Accounts & Transactions API

A FastAPI application demonstrating all Python-specific endpoint resolution patterns.

**Endpoints (18+):**
```
POST/GET/PUT/DELETE  /accounts, /accounts/{id}
GET                  /accounts/{id}/balance, /accounts/{id}/summary
POST/GET             /transactions, /transactions/{id}
POST/GET             /transfers, /transfers/{id}
GET/PUT              /limits/{accountId}
GET                  /statements/{accountId}, /statements/{accountId}/{month}
POST/GET/PUT/DELETE  /cards, /cards/{id}/status
GET                  /merchants/{id}, /merchants
GET                  /admin/health, /admin/stats
POST                 /auth/token, /auth/refresh
```

**Deep analysis features exercised:**
- URL constants: `ACCOUNTS_URL = "/accounts"`
- Path builder helpers: `AccountsClient.get_account(account_id)`
- Wrapper methods for indirect resolution

**Coverage journey:**
- `tests/tests-initial/` — accounts + transactions only (~50%)
- `tests/tests-complete/` — 100% including security and error scenarios

```bash
cd examples/python-fastapi-complex
pip install -r requirements.txt
pytest tests/tests-initial/    # partial coverage
pytest tests/tests-complete/   # full coverage
make analyze
```

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## ruby-rails-complex

> **Location:** `examples/ruby-rails-complex/`
> **Domain:** User Management & Subscription Billing API

A Rails API mode application with subscription billing, usage tracking, and audit logs.

**Endpoints (18+):**
```
POST/GET/PUT/DELETE   /api/v1/users, /api/v1/users/:id
POST/GET/PUT/DELETE   /api/v1/subscriptions/:id
POST                  /api/v1/subscriptions/:id/cancel
GET/PUT/DELETE        /api/v1/invoices, /api/v1/invoices/:id/pay
GET/POST              /api/v1/usage/:subscription_id, /api/v1/usage/record
GET/POST/DELETE       /api/v1/seats, /api/v1/seats/:id
GET                   /api/v1/plans, /api/v1/plans/:id
POST                  /api/v1/coupons/validate
GET                   /api/v1/audit-logs
POST                  /api/v1/webhooks
GET                   /api/v1/admin/health, /api/v1/admin/stats
```

**Deep analysis features exercised:**
- Helper abstractions: `ApiHelpers::USERS_PATH`
- Path constants in RSpec step helpers
- `create_user`, `create_subscription` wrapper methods

**Coverage journey:**
- `spec/requests/spec-initial/` — users + subscriptions (~50%)
- `spec/requests/spec-complete/` — 100% coverage

```bash
cd examples/ruby-rails-complex
bundle install
rspec spec/requests/spec-initial   # partial
rspec spec/requests/spec-complete  # full
make analyze
```

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## cucumber-ruby-complex

> **Location:** `examples/cucumber-ruby-complex/`
> **Domain:** Payment Processing Platform

Demonstrates that the analyzer resolves endpoints **indirectly through BDD layers**:
Feature file → Step definition → API helper → URL constant → HTTP call.

**Endpoints (16+):**
```
POST/GET     /payments, /payments/{id}
POST         /payments/{id}/capture, /payments/{id}/void, /payments/{id}/refund
POST/GET     /refunds, /refunds/{id}
POST/GET/PUT /disputes, /disputes/{id}, /disputes/{id}/respond
GET/PATCH    /accounts/{id}, /accounts/{id}/balance, /accounts/{id}/limits
POST         /webhooks
GET          /admin/health, /admin/stats
```

**BDD resolution chain:**
```gherkin
# payments.feature
When I create a payment of $100 for order "ORD-001"
```
```ruby
# payment_steps.rb
When("I create a payment of ${float}...") do |amount, order_id|
  @response = PaymentApiHelper.create_payment(amount: amount, order_id: order_id)
end
```
```ruby
# api_helper.rb / path_constants.rb
PAYMENTS_PATH = "/payments"
def self.create_payment(attrs)
  http_client.post(PAYMENTS_PATH, body: attrs.to_json)
end
```

The analyzer traces through all three layers to detect endpoint coverage.

```bash
cd examples/cucumber-ruby-complex
bundle install
cucumber features/          # run all scenarios
make analyze
```

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## cucumber-java-complex

> **Location:** `examples/cucumber-java-complex/`
> **Domain:** Banking Platform API

Java Cucumber project demonstrating **both direct and indirect endpoint invocation**.

**Endpoints (18+):**
```
POST/GET/PUT/DELETE  /api/v1/accounts, /api/v1/accounts/{id}
GET                  /api/v1/accounts/{id}/balance
POST/GET             /api/v1/transactions, /api/v1/transactions/{id}
POST/GET             /api/v1/transfers, /api/v1/transfers/{id}
POST/GET/POST        /api/v1/loans, /api/v1/loans/{id}/payment
GET/POST             /api/v1/savings/{id}, /api/v1/savings/{id}/interest
POST/GET             /api/v1/beneficiaries
GET                  /api/v1/statements/{accountId}
GET                  /api/v1/admin/health, /api/v1/admin/metrics
```

**PathConstants.java** enables indirect resolution:
```java
public static final String ACCOUNTS_PATH = "/api/v1/accounts";
public static final String ACCOUNT_BALANCE_PATH = "/api/v1/accounts/{id}/balance";
```

```java
// BankingApiHelper.java
public Response createAccount(AccountRequest request) {
    return given().body(request).when().post(PathConstants.ACCOUNTS_PATH)...;
}
```

```bash
cd examples/cucumber-java-complex
./gradlew test
./gradlew analyze
```

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## kotlin-ktor-complex

> **Location:** `examples/kotlin-ktor-complex/`
> **Domain:** Healthcare Appointments & Patient Management

A Ktor 2.x API with coroutines, demonstrating Kotlin-specific patterns.

**Endpoints (18+):**
```
POST/GET/PUT/DELETE  /patients, /patients/{id}
GET                  /doctors, /doctors/{id}, /doctors/{id}/availability
POST/GET/PUT/DELETE  /appointments, /appointments/{id}
POST                 /appointments/{id}/check-in, /appointments/{id}/complete
POST/GET/PUT         /prescriptions, /prescriptions/{id}/fulfill
POST/GET/POST        /billing/invoices, /billing/invoices/{id}/pay
GET/POST             /medical-records/{patientId}
GET                  /admin/health, /admin/metrics, /admin/audit-log
```

**ApiPaths.kt** object with constants:
```kotlin
object ApiPaths {
    const val PATIENTS = "/patients"
    const val APPOINTMENT_CHECKIN = "/appointments/{id}/check-in"
}
```

**HealthcareApiClient** for indirect resolution:
```kotlin
suspend fun bookAppointment(request: AppointmentRequest) =
    client.post(ApiPaths.APPOINTMENTS) { setBody(request) }
```

**Coverage journey:**
- `tests-initial/` — patients + appointments (~50%)
- `tests-complete/` — 100% all resources

```bash
cd examples/kotlin-ktor-complex
./gradlew test
./gradlew analyze
```

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## javascript-node-express-complex

> **Location:** `examples/javascript-node-express-complex/`
> **Domain:** Logistics & Shipment Tracking Platform

The most comprehensive example — 20+ endpoints, also used for dashboard/reporting flow validation.

**Endpoints (20+):**
```
POST/GET/PUT/DELETE  /shipments, /shipments/:id
POST                 /shipments/:id/dispatch, /shipments/:id/deliver, /shipments/:id/cancel
GET                  /shipments/:id/tracking
POST/GET/PUT/DELETE  /orders, /orders/:id/status
GET/POST             /warehouses, /warehouses/:id/inventory
GET                  /carriers, /carriers/:id, /carriers/:id/rates
POST/GET/PUT         /returns, /returns/:id/approve
POST/GET             /tracking/events, /tracking/history/:trackingNumber
GET/PUT              /customers/:id
GET                  /admin/health, /admin/metrics, /admin/audit
```

**routes.js** constants + **apiClient.js** wrapper demonstrate full indirect resolution chain.

**Coverage journey:**
- `tests/tests-initial/` — shipments + orders (~50%)
- `tests/tests-complete/` — 100% with security and error scenarios

```bash
cd examples/javascript-node-express-complex
npm install
npm run test:initial   # partial coverage
npm run test           # full coverage
npm run analyze
```

Also includes `semgrep.yaml` and Trivy config for security scanner integration examples.

**CI:** `.github/workflows/analyze.yml` · `Jenkinsfile`

---

## Running All Examples

To run the analyzer against all examples from the repository root:

```bash
make examples-analyze-all
```

Or run a specific example:

```bash
make examples-analyze EXAMPLE=python-fastapi-complex
```

---

## Coverage Improvement Journey

Each example models a four-phase workflow to reach 100%:

| Phase | Description |
|-------|-------------|
| **A — Partial** | Initial test suite with ~50% coverage (`tests-initial/`) |
| **B — Analyze** | Run analyzer to identify gaps and get recommendations |
| **C — Improve** | Add missing tests based on intelligence findings |
| **D — Verify** | Rerun analyzer; coverage reaches 100% (`tests-complete/`) |

Use the analyzer's `coverage-intelligence` command to see prioritized findings:

```bash
node dist/index.js coverage-intelligence \
  --reports-dir examples/java-spring-complex/reports \
  --project-name java-spring-complex
```

---

## CI Integration Matrix

| Example | GitHub Actions | Jenkins | Security Scan Config |
|---------|---------------|---------|---------------------|
| typescript | ✓ | ✓ | — |
| java-spring-complex | ✓ | ✓ | Semgrep |
| python-fastapi-complex | ✓ | ✓ | Semgrep |
| ruby-rails-complex | ✓ | ✓ | — |
| cucumber-ruby-complex | ✓ | ✓ | — |
| cucumber-java-complex | ✓ | ✓ | — |
| kotlin-ktor-complex | ✓ | ✓ | — |
| javascript-node-express-complex | ✓ | ✓ | Semgrep + Trivy |

---

## Next Steps

- [TypeScript Example (detailed walkthrough) →](./typescript-example.md)
- [Multi-Language Support →](./multi-language.md)
- [CI/CD Integration →](./ci-cd.md)
- [Interpreting Reports →](./interpreting-reports.md)
- [Coverage Intelligence →](./coverage-intelligence.md)
