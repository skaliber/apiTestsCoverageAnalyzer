# Logistics & Shipment Tracking API

**Language:** JavaScript (Node.js + Express)
**Purpose:** Example project demonstrating API endpoint coverage analysis with the `apiTestsCoverageAnalyzer` tool.

This project simulates a realistic logistics platform with 25+ endpoints across 8 resource groups. It is designed to showcase both **direct** and **indirect** endpoint resolution, a full **coverage journey** from ~45% to 100%, and integration with CI/CD pipelines.

---

## Directory Structure

```
javascript-node-express-complex/
  src/
    routes/           Express routers for each resource group
    services/         Business logic and rule enforcement
    middleware/       Auth, validation, rate limiting
    models/           In-memory data store with typed factories
    helpers/
      routes.js       Centralized route path constants (CRITICAL)
      apiClient.js    Axios wrapper client that uses ROUTES constants
      pathBuilder.js  URL construction utilities
    app.js            Express application factory
    server.js         HTTP server entry point
  tests/
    tests-initial/    ~45% coverage (shipments + orders, partial)
    tests-complete/   100% coverage (all endpoints + error + security)
    helpers/
      testClient.js   Supertest wrapper client
      fixtures.js     Shared test data + store reset helper
  openapi.yaml        Full OpenAPI 3.1 specification (25 endpoints)
  config.yaml         Analyzer tool configuration
  business-rules.yaml 8 formal business rules
  integration-flows.yaml 5 multi-step integration flows
  package.json
  jest.config.js
  scripts/
    run-analyzer.js   Script to invoke the coverage analyzer
  .github/
    workflows/
      analyze.yml     GitHub Actions CI/CD pipeline
  Jenkinsfile
  semgrep.yaml        Semgrep SAST rules
  trivy.yaml          Trivy vulnerability scan configuration
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/shipments` | Create a shipment |
| GET | `/shipments` | List shipments (with filters) |
| GET | `/shipments/:id` | Get shipment by ID |
| PUT | `/shipments/:id` | Update shipment |
| DELETE | `/shipments/:id` | Delete pending shipment |
| POST | `/shipments/:id/dispatch` | Dispatch a shipment |
| POST | `/shipments/:id/deliver` | Mark as delivered |
| POST | `/shipments/:id/cancel` | Cancel shipment |
| GET | `/shipments/:id/tracking` | Get shipment tracking info |
| POST | `/orders` | Create an order |
| GET | `/orders` | List orders |
| GET | `/orders/:id` | Get order by ID |
| PUT | `/orders/:id/status` | Update order status |
| DELETE | `/orders/:id` | Delete pending order |
| GET | `/warehouses` | List warehouses |
| GET | `/warehouses/:id` | Get warehouse by ID |
| POST | `/warehouses/:id/inventory` | Update warehouse inventory |
| GET | `/carriers` | List carriers |
| GET | `/carriers/:id` | Get carrier by ID |
| GET | `/carriers/:id/rates` | Get carrier shipping rates |
| POST | `/returns` | Create return request |
| GET | `/returns/:id` | Get return by ID |
| PUT | `/returns/:id/approve` | Approve/reject return |
| POST | `/tracking/events` | Create tracking event |
| GET | `/tracking/history/:trackingNumber` | Get tracking history |
| GET | `/customers/:id` | Get customer |
| PUT | `/customers/:id` | Update customer |
| GET | `/admin/health` | Health check |
| GET | `/admin/metrics` | Operational metrics |
| GET | `/admin/audit` | Audit log |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
cd examples/javascript-node-express-complex
npm install
```

### Run the server

```bash
npm start
# Server listening on http://0.0.0.0:3000
```

### Authentication

All endpoints require a Bearer token. Use the test tokens defined in `src/middleware/auth.js`:

| Token | Role | Description |
|-------|------|-------------|
| `token-admin-001` | admin | Full access including admin endpoints |
| `token-ops-001` | operator | Read/write on all business endpoints |
| `token-cust-001` | customer | Own customer record (CUST-001) only |
| `token-cust-002` | customer | Own customer record (CUST-002) only |
| `token-readonly` | readonly | Read-only access to all endpoints |

```bash
curl -H "Authorization: Bearer token-ops-001" http://localhost:3000/carriers
```

---

## Running Tests

```bash
# All tests
npm test

# Initial test suite only (~45% coverage, shows gaps)
npm run test:initial

# Complete test suite (100% coverage)
npm run test:complete

# With Jest code coverage
npm run test:coverage
```

---

## Coverage Analysis

### Run the analyzer

```bash
# Analyze complete test suite (from repo root)
cd examples/javascript-node-express-complex
npm run analyze

# Analyze initial suite (shows gaps)
npm run analyze:initial
```

### Understanding the coverage journey

This project is specifically designed to demonstrate the value of comprehensive API test coverage.

**Phase 1 — Initial coverage (`tests-initial/`)**

The initial test suite covers only two resource groups with partial coverage:

- `shipments.test.js` — covers `POST /shipments`, `GET /shipments`, `GET /shipments/:id`, `PUT /shipments/:id` (missing dispatch, deliver, cancel, tracking endpoints)
- `orders.test.js` — covers `POST /orders`, `GET /orders`, `GET /orders/:id` (missing status update and delete)

Expected analyzer output:
```
Endpoints covered:   11 / 25   (44%)
Missing endpoints:
  - POST /shipments/:id/dispatch
  - POST /shipments/:id/deliver
  - POST /shipments/:id/cancel
  - GET  /shipments/:id/tracking
  - PUT  /orders/:id/status
  - DELETE /orders/:id
  - GET  /warehouses, GET /warehouses/:id, POST /warehouses/:id/inventory
  - GET  /carriers, GET /carriers/:id, GET /carriers/:id/rates
  - POST /returns, GET /returns/:id, PUT /returns/:id/approve
  - POST /tracking/events, GET /tracking/history/:trackingNumber
  - GET  /customers/:id, PUT /customers/:id
  - GET  /admin/health, GET /admin/metrics, GET /admin/audit
```

**Phase 2 — Complete coverage (`tests-complete/`)**

The complete test suite covers all 25 endpoints plus:
- Business rule violation scenarios (8 rules)
- Error and edge cases (404, 401, 403, 422, 409)
- Security and RBAC scenarios
- Both direct supertest URLs and indirect wrapper client calls

Expected analyzer output:
```
Endpoints covered:   25 / 25   (100%)
Business rules tested:  8 / 8  (100%)
```

---

## Indirect Endpoint Resolution

A key feature of this example is demonstrating **indirect endpoint resolution** — the ability for the analyzer to recognize endpoints accessed through wrapper client methods rather than literal URL strings.

### How it works

**1. `src/helpers/routes.js`** defines all route paths as named constants:
```javascript
const ROUTES = {
  SHIPMENTS: '/shipments',
  SHIPMENT_DISPATCH: '/shipments/:id/dispatch',
  // ...
};
```

**2. `src/helpers/apiClient.js`** wraps Axios and references these constants:
```javascript
dispatchShipment(id) {
  return this.client.post(ROUTES.SHIPMENT_DISPATCH.replace(':id', id));
}
```

**3. Tests use both approaches:**
```javascript
// Direct URL string (standard resolution)
await request(app).post('/shipments/SHP-001/dispatch').set(AUTH).send();

// Wrapper client call (indirect resolution)
await apiClient.dispatchShipment('SHP-001');
```

The analyzer traces the `apiClient.dispatchShipment()` call through to `ROUTES.SHIPMENT_DISPATCH` and resolves it to `POST /shipments/:id/dispatch`.

---

## Business Rules

| Rule ID | Name | Enforcement |
|---------|------|-------------|
| `shipment-weight-limit` | Max 1000 kg per shipment | POST /shipments (400) |
| `carrier-active-required` | Carrier must be active | POST /shipments, PUT /shipments/:id (409) |
| `address-validation-required` | Address validated before dispatch | POST /shipments/:id/dispatch (422) |
| `return-window-30-days` | Returns within 30 days of delivery | POST /returns (422) |
| `warehouse-capacity-check` | Cannot exceed warehouse capacity | POST /warehouses/:id/inventory (409) |
| `duplicate-tracking-prevention` | Unique tracking events | POST /tracking/events (409) |
| `hazmat-special-carrier` | Hazmat needs certified carrier | POST /shipments (409) |
| `insurance-required-high-value` | Insurance required for >$5000 | POST /shipments/:id/dispatch (422) |

---

## Integration Flows

Five multi-step flows are documented in `integration-flows.yaml`:

| Flow | Name |
|------|------|
| FLOW001 | Shipment Creation to Delivery |
| FLOW002 | Order Fulfillment from Warehouse |
| FLOW003 | Return Processing |
| FLOW004 | Carrier Rate Comparison |
| FLOW005 | Real-time Tracking Update |

---

## CI/CD Integration

### GitHub Actions

The `.github/workflows/analyze.yml` pipeline:
1. Installs dependencies (Node 20, npm ci)
2. Runs initial and complete test suites
3. Collects Jest code coverage and uploads to Codecov
4. Runs the API coverage analyzer against both test suites
5. Uploads HTML coverage dashboard as an artifact
6. Posts a coverage summary to the GitHub Pull Request
7. Publishes a GitHub Actions Step Summary
8. Runs Trivy vulnerability scanning (SARIF to GitHub Security)
9. Runs Semgrep SAST scanning (SARIF to GitHub Security)

### Jenkins

The `Jenkinsfile` pipeline runs the same stages with:
- HTML Publisher plugin for the coverage dashboard
- JUnit XML test result publishing
- Warnings NG plugin for Trivy/Semgrep SARIF

---

## Security Scanning Integration

### Trivy

```bash
# Dependency vulnerability scan
trivy fs --config trivy.yaml .

# With SARIF output for GitHub Security
trivy fs --format sarif --output trivy-results.sarif .
```

### Semgrep

```bash
# SAST scan with project rules
semgrep --config=semgrep.yaml src/

# With standard Express/JavaScript rules
semgrep --config=p/express --config=p/javascript src/
```

Custom Semgrep rules in `semgrep.yaml` detect:
- Express routes missing authentication middleware
- Async route handlers without try/catch
- Routes missing rate limiting
- Stack traces exposed in error responses
- Secrets logged to console

---

## Dashboard Integration Notes

When integrated with the `apiTestsCoverageAnalyzer` dashboard:

1. **Coverage trend** — configure with `testDir: tests/tests-complete` in `config.yaml` to track full coverage over time.

2. **Gap detection** — set `testDir: tests/tests-initial` to demonstrate identified gaps before the coverage improvement sprint.

3. **Business rule linkage** — the `business-rules.yaml` file maps rules to endpoints, enabling the dashboard to show which business requirements lack test coverage.

4. **Integration flow trace** — `integration-flows.yaml` allows the dashboard to verify that multi-step flows are covered end-to-end, not just individual endpoints.

5. **Indirect resolution** — the dashboard should follow `src/helpers/routes.js` constants through `src/helpers/apiClient.js` to attribute wrapper client calls to their underlying endpoints.

### Example dashboard report structure

```
API Coverage Summary: logistics-tracking-api
============================================
Specification: openapi.yaml (25 endpoints)
Test suite:    tests/tests-complete

Endpoint Coverage:     25/25  (100.0%)
Method Coverage:       25/25  (100.0%)
Status Code Coverage:  85/95  (89.5%)

Business Rules:        8/8    (100.0%)
Integration Flows:     5/5    (100.0%)

Resolution methods:
  Direct URL strings:       87 test calls
  Indirect (wrapper client): 26 test calls
  Total unique endpoints:   25

Uncovered scenarios:
  - None (all endpoints have green coverage)
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20 |
| Framework | Express 4.18 |
| HTTP client | Axios 1.6 (wrapper tests) |
| Test framework | Jest 29 |
| Integration testing | Supertest 6 |
| API specification | OpenAPI 3.1 |
| Vulnerability scan | Trivy |
| SAST | Semgrep |
| CI/CD | GitHub Actions, Jenkins |
