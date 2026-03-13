# Coverage Intelligence Report

> Generated: 2026-03-11T15:46:18.852Z  
> Project: **python-fastapi-complex**

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | 17 |
| Total Recommendations | 10 |
| Max Risk Score | 73 (High) |
| Avg Risk Score | 56 |
| Critical Uncovered Items | 1 |
| Unprotected Security Findings | 0 |

### Findings by Severity

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 1 |
| 🟡 MEDIUM | 16 |
| 🔵 LOW | 0 |

### Recommendations by Priority

| Priority | Count |
|----------|-------|
| 🚨 P0 | 0 |
| 🔴 P1 | 2 |
| 🟠 P2 | 8 |
| 🟡 P3 | 0 |

## Top Functional Findings

### 1. 🟡 Uncovered endpoint: POST /auth/refresh

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `POST /auth/refresh`
- **Description:** Endpoint POST /auth/refresh has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 2. 🟡 Uncovered endpoint: GET /accounts/{account_id}/balance

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /accounts/{account_id}/balance`
- **Description:** Endpoint GET /accounts/{account_id}/balance has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 3. 🟡 Uncovered endpoint: GET /accounts/{account_id}/summary

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /accounts/{account_id}/summary`
- **Description:** Endpoint GET /accounts/{account_id}/summary has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 4. 🟠 Uncovered endpoint: GET /transfers/{transfer_id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** HIGH
- **Endpoint:** `GET /transfers/{transfer_id}`
- **Description:** Endpoint GET /transfers/{transfer_id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 5. 🟡 Uncovered endpoint: PUT /limits/{account_id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `PUT /limits/{account_id}`
- **Description:** Endpoint PUT /limits/{account_id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 6. 🟡 Uncovered endpoint: GET /statements/{account_id}/{month}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /statements/{account_id}/{month}`
- **Description:** Endpoint GET /statements/{account_id}/{month} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 7. 🟡 Uncovered endpoint: DELETE /cards/{card_id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `DELETE /cards/{card_id}`
- **Description:** Endpoint DELETE /cards/{card_id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 8. 🟡 Uncovered endpoint: PUT /cards/{card_id}/status

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `PUT /cards/{card_id}/status`
- **Description:** Endpoint PUT /cards/{card_id}/status has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 9. 🟡 Uncovered endpoint: GET /merchants/{merchant_id}

- **Category:** uncovered-endpoint
- **Source:** coverage-gap-analysis
- **Severity:** MEDIUM
- **Endpoint:** `GET /merchants/{merchant_id}`
- **Description:** Endpoint GET /merchants/{merchant_id} has no test coverage.
- **Missing Tests:** positive-api-test, negative-api-test
- **Framework Hints:** pytest, httpx, requests

### 10. 🟡 Uncovered business rule: BR-001

- **Category:** missing-business-rule-test
- **Source:** business-coverage
- **Severity:** MEDIUM
- **Endpoint:** N/A
- **Description:** Business rule "BR-001" has no test coverage.
- **Missing Tests:** business-rule-test
- **Framework Hints:** pytest, httpx, requests

## Top Missing Test Recommendations

### 1. 🔴 Add positive api test for: Uncovered endpoint: GET /transfers/{transfer_id}

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Risk Score** | 73 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /transfers/{transfer_id}` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint GET /transfers/{transfer_id} has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-4

### 2. 🔴 Add positive api test for: Uncovered endpoint: POST /auth/refresh

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Risk Score** | 65 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `POST /auth/refresh` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint POST /auth/refresh has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-1

### 3. 🟠 Add positive api test for: Uncovered endpoint: DELETE /cards/{card_id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `DELETE /cards/{card_id}` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint DELETE /cards/{card_id} has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-7

### 4. 🟠 Add positive api test for: Uncovered endpoint: PUT /cards/{card_id}/status

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `PUT /cards/{card_id}/status` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint PUT /cards/{card_id}/status has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-8

### 5. 🟠 Add positive api test for: Uncovered endpoint: GET /merchants/{merchant_id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 54 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /merchants/{merchant_id}` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint GET /merchants/{merchant_id} has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-9

### 6. 🟠 Add business rule test for: Uncovered business rule: BR-001

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 52 (🟠 High) |
| **Test Type** | business-rule-test |
| **Endpoint** | N/A |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | medium |

**Rationale:** Business rule "BR-001" has no test coverage. pytest test function

**Linked Findings:** ff-biz-1773243978851-10

### 7. 🟠 Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/balance

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 51 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /accounts/{account_id}/balance` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint GET /accounts/{account_id}/balance has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-2

### 8. 🟠 Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/summary

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 51 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /accounts/{account_id}/summary` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint GET /accounts/{account_id}/summary has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-3

### 9. 🟠 Add positive api test for: Uncovered endpoint: PUT /limits/{account_id}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 51 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `PUT /limits/{account_id}` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint PUT /limits/{account_id} has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-5

### 10. 🟠 Add positive api test for: Uncovered endpoint: GET /statements/{account_id}/{month}

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Risk Score** | 51 (🟠 High) |
| **Test Type** | positive-api-test |
| **Endpoint** | `GET /statements/{account_id}/{month}` |
| **Framework** | pytest |
| **Language** | python |
| **Confidence** | high |

**Rationale:** Endpoint GET /statements/{account_id}/{month} has no test coverage. pytest test function

**Linked Findings:** ff-ep-1773243978851-6

## Highest-Risk Areas

- GET /transfers/{transfer_id} (score 73)
- POST /auth/refresh (score 65)
- DELETE /cards/{card_id} (score 54)
- PUT /cards/{card_id}/status (score 54)
- GET /merchants/{merchant_id} (score 54)
