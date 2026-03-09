# cucumber-java-complex

A realistic **Cucumber + Java BDD** example project demonstrating how the
**API Tests Coverage Analyzer** resolves API endpoints through multiple layers
of Java indirection — from a plain-English feature file all the way down to a
RestAssured HTTP call.

Domain: **Banking Platform API** (accounts, transactions, transfers, loans,
savings, beneficiaries, statements, and admin operations).

---

## How the Analyzer Resolves Endpoints

Feature files contain no URLs. Instead, endpoint coverage is determined by
tracing a four-layer resolution chain:

```
Feature file  (.feature)
  |
  | Gherkin step text matched by annotation
  v
Step definition  (AccountSteps.java, TransactionSteps.java, …)
  |
  | Method call on the domain helper
  v
BankingApiHelper.java
  |
  | References a constant defined in PathConstants
  v
PathConstants.java
  |
  | Literal string value e.g. "/api/v1/accounts/{id}"
  v
ApiClient.java  ->  RestAssured  ->  HTTP call
```

### Example trace

**Feature** (`account_management.feature`):
```gherkin
When I create a checking account with initial deposit of $100
```

**Step definition** (`AccountSteps.java`):
```java
@When("I create a checking account with initial deposit of ${double}")
public void createCheckingAccount(Double initialDeposit) {
    Response response = bankingApiHelper.createAccount(Map.of(
            "type", "CHECKING",
            "initialDeposit", initialDeposit,
            "currency", "USD"
    ));
    testContext.setLastResponse(response);
}
```

**Domain helper** (`BankingApiHelper.java`):
```java
/** POST /api/v1/accounts */
public Response createAccount(Map<String, Object> request) {
    return apiClient.post(PathConstants.ACCOUNTS_PATH, request);
}
```

**Path constant** (`PathConstants.java`):
```java
public static final String ACCOUNTS_PATH = "/api/v1/accounts";
```

**HTTP client** (`ApiClient.java`):
```java
public Response post(String path, Object body) {
    return given(baseSpec)
            .header("Authorization", bearerToken())
            .body(body)
            .when()
            .post(path)   // <-- RestAssured receives "/api/v1/accounts"
            .then().log().all()
            .extract().response();
}
```

The analyzer reads `PathConstants.java`, builds a map of constant names to
literal path strings, then scans `BankingApiHelper.java` for usages of those
constants and `ApiClient.java` to confirm the corresponding HTTP method.
Finally it walks back through step definitions to Gherkin scenarios, producing
a full endpoint-to-scenario coverage matrix.

---

## Project Structure

```
cucumber-java-complex/
  src/
    test/
      java/
        com/example/banking/
          steps/
            AccountSteps.java       - Account CRUD, balance, statement
            TransactionSteps.java   - Deposits, withdrawals, history
            LoanSteps.java          - Loan application & repayment
            TransferSteps.java      - Transfers & beneficiary management
            AuthSteps.java          - Authentication & session
            AdminSteps.java         - Health, metrics, audit logs
          support/
            ApiClient.java          - RestAssured wrapper (HTTP layer)
            BankingApiHelper.java   - Domain helper → PathConstants
            PathConstants.java      - Literal URL path constants
            TestContext.java        - Scenario-scoped shared state
            Hooks.java              - @Before authentication, @After cleanup
          runners/
            CucumberRunner.java     - JUnit 5 suite entry point
      resources/
        features/
          account_management.feature
          transactions.feature
          loans.feature
          transfers.feature
          security_scenarios.feature
          error_scenarios.feature
          admin_operations.feature
  openapi.yaml            - Full OpenAPI 3.0 spec (22 endpoints)
  config.yaml             - Analyzer configuration
  business-rules.yaml     - 8 business rules mapped to endpoints
  integration-flows.yaml  - 5 end-to-end integration flows
  build.gradle            - Gradle build (Java 21, Cucumber, RestAssured)
  .github/workflows/
    analyze.yml           - GitHub Actions: test + analyze + gate
  Jenkinsfile             - Jenkins declarative pipeline
```

---

## Covered Endpoints (22 total)

| Method | Path | Domain |
|--------|------|--------|
| POST   | /api/v1/auth/token | Auth |
| POST   | /api/v1/auth/logout | Auth |
| POST   | /api/v1/accounts | Accounts |
| GET    | /api/v1/accounts | Accounts |
| GET    | /api/v1/accounts/{id} | Accounts |
| PUT    | /api/v1/accounts/{id} | Accounts |
| DELETE | /api/v1/accounts/{id} | Accounts |
| GET    | /api/v1/accounts/{id}/balance | Accounts |
| GET    | /api/v1/accounts/{id}/statement | Accounts |
| POST   | /api/v1/transactions | Transactions |
| GET    | /api/v1/transactions | Transactions |
| GET    | /api/v1/transactions/{id} | Transactions |
| POST   | /api/v1/transfers | Transfers |
| GET    | /api/v1/transfers/{id} | Transfers |
| POST   | /api/v1/loans | Loans |
| GET    | /api/v1/loans/{id} | Loans |
| POST   | /api/v1/loans/{id}/payment | Loans |
| POST   | /api/v1/savings | Savings |
| GET    | /api/v1/savings/{id} | Savings |
| POST   | /api/v1/savings/{id}/interest | Savings |
| POST   | /api/v1/beneficiaries | Beneficiaries |
| GET    | /api/v1/beneficiaries | Beneficiaries |
| GET    | /api/v1/statements/{accountId} | Statements |
| GET    | /api/v1/admin/health | Admin |
| GET    | /api/v1/admin/metrics | Admin |
| GET    | /api/v1/admin/audit-logs | Admin |

---

## Running the Tests

### Prerequisites

- Java 21+
- Gradle 8+ (or use the wrapper `./gradlew`)
- The banking API running at `http://localhost:8080` (or pass a custom URL)

### Run all BDD scenarios

```bash
cd examples/cucumber-java-complex
./gradlew test -Dbanking.base-url=http://localhost:8080
```

### Run a single feature

```bash
./gradlew runFeature \
  -Dcucumber.features=src/test/resources/features/account_management.feature
```

### Run tagged scenarios only

```bash
./gradlew test \
  -Dcucumber.filter.tags="@NoAuth"
```

---

## Running the Coverage Analysis

After the tests have generated `build/reports/cucumber/results.json`:

```bash
npx api-tests-coverage-analyzer --config config.yaml --output build/reports/coverage-analysis
```

Or use the bundled Gradle task:

```bash
./gradlew analyzeApiCoverage
```

The report is written to `build/reports/coverage-analysis/` in HTML, JSON,
and Markdown formats.

---

## Business Rules

Eight business rules are defined in `business-rules.yaml` and mapped to
specific feature scenarios:

| ID | Rule | Enforced By |
|----|------|-------------|
| BR-001 | account-balance-positive | POST /api/v1/transactions |
| BR-002 | transfer-daily-limit | POST /api/v1/transfers |
| BR-003 | loan-eligibility-check | POST /api/v1/loans |
| BR-004 | loan-payment-schedule | POST /api/v1/loans/{id}/payment |
| BR-005 | savings-minimum-balance | POST /api/v1/transactions |
| BR-006 | beneficiary-verification | POST /api/v1/transfers |
| BR-007 | dormant-account-restrictions | POST /api/v1/transactions |
| BR-008 | two-factor-for-large-transfers | POST /api/v1/transfers |

---

## Integration Flows

Five end-to-end flows are defined in `integration-flows.yaml`:

| ID | Flow |
|----|------|
| FLOW001 | Account Opening to First Transaction |
| FLOW002 | Loan Application and First Payment |
| FLOW003 | International Wire Transfer |
| FLOW004 | Savings Account Interest Calculation |
| FLOW005 | Account Closure Process |

---

## CI/CD

- **GitHub Actions** (`.github/workflows/analyze.yml`): three-job pipeline —
  `test`, `coverage-analysis`, `coverage-gate` (requires >= 80% coverage).
- **Jenkins** (`Jenkinsfile`): declarative pipeline with Docker agent, Cucumber
  reporting plugin, HTML publisher, and email notification on failure.
