# Wallets & Payments API — TypeScript Example

A realistic Wallets and Payments REST API demonstrating the **api-test-coverage-analyzer** library with intentional coverage gaps.

## Overview

This project implements a multi-layer financial API with:
- **Wallet management** — create, fund, debit, transfer, freeze/unfreeze, close
- **Payments** — create with fraud check + payment processor, refund
- **Transactions** — history per wallet or user
- **Risk rules** — minimum fund amount, daily limit, insufficient funds, currency matching
- **Auth** — JWT Bearer token on all endpoints

Tests span four layers: unit, integration, blackbox, and WireMock (nock).

## Quick Start

```bash
npm install
npm run dev        # starts on http://localhost:3001
curl http://localhost:3001/health
```

Generate a token for manual testing:
```bash
node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({userId:'u1',role:'user'},'test-secret',{expiresIn:'1h'}))"
```

## Running Tests

```bash
npm run test:unit         # unit tests (walletService, riskService, paymentService)
npm run test:integration  # supertest integration tests
npm run test:blackbox     # end-to-end blackbox tests
npm run test:wiremock     # nock-based external dependency tests
npm test                  # all test layers
```

## Running the Analyzer

```bash
npm run analyze
# or directly:
bash scripts/run-analyzer.sh
```

Reports are saved to `./reports/`.

## Intentional Coverage Gaps

The following scenarios are **deliberately untested** to demonstrate gap detection:

| Gap | Description |
|-----|-------------|
| Frozen wallet debit | Debiting a frozen wallet should return 422 — not tested |
| Daily limit enforcement | Transactions exceeding $10,000/day limit — not tested |
| Processor failure fallback | Payment processor 5xx error path — not tested |
| Refund after 30 days | Expired refund window rejection — not tested |
| `checkDailyLimit` unit test | `riskService.checkDailyLimit` — not covered in unit tests |

## Viewing the Dashboard

```bash
# From the example directory — launches the Vite dashboard at http://localhost:5173
npm run dashboard

# Or manually from the repo root:
cd ../../dashboard
npm install
npm run dev   # http://localhost:5173

# Capture screenshots
node scripts/generate-screenshots.js
```

## Observability (Prometheus + Grafana)

```bash
cd observability
docker compose up -d

# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3000  (admin / admin)
```

The Grafana dashboard (`grafana-dashboard.json`) shows:
- Wallet balance by wallet ID
- Transaction count by type
- Payment success/failure rate
- API test coverage risk score
