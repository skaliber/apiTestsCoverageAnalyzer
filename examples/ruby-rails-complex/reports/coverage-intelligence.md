# Coverage Intelligence Report

> Generated: 2026-03-11T15:43:32.132Z  
> Project: **ruby-rails-complex**

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | 34 |
| Total Recommendations | 27 |
| Max Risk Score | 54 (High) |
| Avg Risk Score | 53 |
| Critical Uncovered Items | 0 |
| Unprotected Security Findings | 0 |

### Findings by Severity

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 0 |
| 🟡 MEDIUM | 34 |
| 🔵 LOW | 0 |

### Recommendations by Priority

| Priority | Count |
|----------|-------|
| 🚨 P0 | 0 |
| 🔴 P1 | 0 |
| 🟠 P2 | 27 |
| 🟡 P3 | 0 |

## Top Functional Findings

### 1. 🟡 Uncovered endpoint: GET /users

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /users`
- **Description:** Endpoint GET /users has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 2. 🟡 Uncovered endpoint: POST /users

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `POST /users`
- **Description:** Endpoint POST /users has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 3. 🟡 Uncovered endpoint: GET /users/{id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /users/{id}`
- **Description:** Endpoint GET /users/{id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 4. 🟡 Uncovered endpoint: PUT /users/{id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `PUT /users/{id}`
- **Description:** Endpoint PUT /users/{id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 5. 🟡 Uncovered endpoint: DELETE /users/{id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `DELETE /users/{id}`
- **Description:** Endpoint DELETE /users/{id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 6. 🟡 Uncovered endpoint: POST /subscriptions

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `POST /subscriptions`
- **Description:** Endpoint POST /subscriptions has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 7. 🟡 Uncovered endpoint: GET /subscriptions/{id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /subscriptions/{id}`
- **Description:** Endpoint GET /subscriptions/{id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 8. 🟡 Uncovered endpoint: PUT /subscriptions/{id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `PUT /subscriptions/{id}`
- **Description:** Endpoint PUT /subscriptions/{id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 9. 🟡 Uncovered endpoint: DELETE /subscriptions/{id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `DELETE /subscriptions/{id}`
- **Description:** Endpoint DELETE /subscriptions/{id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

### 10. 🟡 Uncovered endpoint: GET /subscriptions/{id}/upgrade

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /subscriptions/{id}/upgrade`
- **Description:** Endpoint GET /subscriptions/{id}/upgrade has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** rspec, minitest, rails-request-specs

## Top Missing Test Recommendations

### 1. 🟠 Add positive api test for: Uncovered endpoint: POST /subscriptions

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `POST /subscriptions` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint POST /subscriptions has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-6

### 2. 🟠 Add positive api test for: Uncovered endpoint: GET /subscriptions/{id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /subscriptions/{id}` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint GET /subscriptions/{id} has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-7

### 3. 🟠 Add positive api test for: Uncovered endpoint: PUT /subscriptions/{id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `PUT /subscriptions/{id}` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint PUT /subscriptions/{id} has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-8

### 4. 🟠 Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `DELETE /subscriptions/{id}` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint DELETE /subscriptions/{id} has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-9

### 5. 🟠 Add positive api test for: Uncovered endpoint: GET /subscriptions/{id}/upgrade

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /subscriptions/{id}/upgrade` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint GET /subscriptions/{id}/upgrade has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-10

### 6. 🟠 Add positive api test for: Uncovered endpoint: POST /subscriptions/{id}/cancel

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `POST /subscriptions/{id}/cancel` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint POST /subscriptions/{id}/cancel has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-11

### 7. 🟠 Add positive api test for: Uncovered endpoint: GET /invoices

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /invoices` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint GET /invoices has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-12

### 8. 🟠 Add positive api test for: Uncovered endpoint: GET /invoices/{id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /invoices/{id}` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint GET /invoices/{id} has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-13

### 9. 🟠 Add positive api test for: Uncovered endpoint: POST /invoices/{id}/pay

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `POST /invoices/{id}/pay` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint POST /invoices/{id}/pay has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-14

### 10. 🟠 Add positive api test for: Uncovered endpoint: GET /usage/{subscription_id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /usage/{subscription_id}` |
| **Framework** | rspec |
| **Language** | ruby |
| **Confidence** | high |

**Rationale:** Endpoint GET /usage/{subscription_id} has no test coverage. RSpec request spec

**Linked Findings:** ff-ep-1773243812131-15

## Highest-Risk Areas

- POST /subscriptions (score 54)
- GET /subscriptions/{id} (score 54)
- PUT /subscriptions/{id} (score 54)
- DELETE /subscriptions/{id} (score 54)
- GET /subscriptions/{id}/upgrade (score 54)
