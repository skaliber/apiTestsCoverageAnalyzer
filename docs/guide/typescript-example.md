# TypeScript Example Project — Wallets / Payments API

A complete end-to-end demonstration of the analyzer running against a realistic TypeScript API.

> **Location**: [`examples/typescript/`](https://github.com/q-intel/apiTestsCoverageAnalyzer/tree/main/examples/typescript)

---

## Overview

The example implements a **Wallets / Payments REST API** using Express.  
It is intentionally realistic enough to expose the kinds of testing gaps the intelligence engine is designed to detect.

---

## Domain

| Concept | Endpoints | Key Business Rules |
|---------|-----------|-------------------|
| **Wallets** | GET/POST/PATCH/DELETE | balance tracking, currency, freeze/unfreeze |
| **Payments** | POST/GET + refund | fraud check, idempotency, 30-day refund window |
| **Transactions** | GET | ledger history |
| **Risk / Limits** | via middleware | daily $10,000 limit, insufficient funds |

### API Endpoints

```
POST   /wallets                  create wallet
GET    /wallets/:id              get wallet + balance
GET    /wallets                  list wallets
PATCH  /wallets/:id/freeze       freeze wallet
PATCH  /wallets/:id/unfreeze     unfreeze wallet
DELETE /wallets/:id              close wallet
POST   /wallets/:id/fund         fund wallet
POST   /wallets/:id/debit        debit wallet
POST   /wallets/:id/transfer     transfer between wallets
POST   /payments                 create payment
GET    /payments/:id             get payment status
POST   /payments/:id/refund      refund payment
GET    /transactions             get transaction history
```

All endpoints require `Authorization: Bearer <JWT>`.

---

## Test Layers

```
tests/
  unit/            Jest unit tests for services and business logic
  integration/     Supertest integration tests against real Express app
  blackbox/        HTTP-level blackbox tests (positive, negative, auth, boundary)
  wiremock/        Nock-backed tests for external dependencies
```

| Test Layer | File | Test Count |
|-----------|------|-----------|
| Unit — Wallet Service | `tests/unit/walletService.test.ts` | 14 |
| Unit — Payment Service | `tests/unit/paymentService.test.ts` | 8 |
| Unit — Risk Service | `tests/unit/riskService.test.ts` | 7 |
| Integration — Wallets | `tests/integration/wallets.integration.test.ts` | 10 |
| Integration — Payments | `tests/integration/payments.integration.test.ts` | 8 |
| Blackbox — Wallets | `tests/blackbox/wallets.blackbox.test.ts` | 7 |
| Blackbox — Payments | `tests/blackbox/payments.blackbox.test.ts` | 5 |
| WireMock — Payment Processor | `tests/wiremock/paymentProcessor.wiremock.test.ts` | 2 |
| WireMock — Fraud Engine | `tests/wiremock/fraudEngine.wiremock.test.ts` | 2 |

---

## Intentional Coverage Gaps

The example deliberately omits tests for these scenarios so the intelligence engine generates meaningful findings:

| Gap | Category | Expected Finding |
|-----|----------|-----------------|
| Frozen wallet debit | business-coverage | `missing-business-rule-test` |
| Daily $10,000 limit enforcement | business-coverage | `missing-boundary-test` |
| Currency mismatch in transfer | business-coverage | `missing-business-rule-test` |
| Refund after 30-day window | error-coverage | `error-scenario-gap` |
| Payment processor failure fallback | integration-flow | `missing-flow-step-test` |

These gaps appear in the generated `coverage-intelligence.md` report.

---

## Getting Started

```bash
cd examples/typescript
npm install
npm test           # run all 63 tests
npm run analyze    # run analyzer + generate reports
```

### Running the API

```bash
npm run dev        # start dev server on http://localhost:3000
```

### Generating reports

The `scripts/run-analyzer.sh` script runs all coverage commands and generates intelligence reports:

```bash
bash scripts/run-analyzer.sh
# Generates: reports/coverage-intelligence.md, reports/coverage-intelligence.json, etc.
```

### Viewing the dashboard

```bash
# From the repo root
cd dashboard && npm run dev
# Open http://localhost:5173 and load reports/coverage-summary.json
```

### Taking screenshots

```bash
npm run screenshots
# Captures reports/screenshots/{overview,endpoints,intelligence,...}.png
```

---

## CI/CD

### GitHub Actions

Located at `.github/workflows/ci.yml`. On every push:
1. Install dependencies
2. Run all tests (unit + integration + blackbox + wiremock)
3. Run the analyzer across all coverage types
4. Generate intelligence reports
5. Capture dashboard screenshots
6. Upload artifacts
7. Publish step summary with P0/P1 findings

### Jenkins

Located at `ci/jenkins/Jenkinsfile`. Stages:
1. `Install` — `npm install`
2. `Test` — all test layers
3. `Analyze` — coverage + intelligence
4. `Reports` — archive HTML + JSON reports
5. `Screenshots` — capture dashboard

---

## Observability

The example includes a complete observability stack:

```bash
cd observability
docker-compose up   # starts Prometheus + Grafana
```

| Service | URL |
|---------|-----|
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 (admin/admin) |

Grafana dashboards include:
- Wallet and payment metrics
- Analyzer risk score panels
- Missing recommendation counts by priority

### Prometheus configuration

`observability/prometheus.yml` scrapes two targets:
- API server metrics at `:3001/metrics`
- Analyzer metrics output (via textfile or push)

---

## OpenAPI Spec

The full OpenAPI 3.0 spec is at `openapi.yaml`. Use it to:
- Run `endpoint-coverage` analysis
- Run `parameter-coverage` analysis
- Run `error-coverage` analysis
- Generate client SDKs
