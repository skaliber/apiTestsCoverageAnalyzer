# Risk Prioritization Report

> Generated: 2026-03-11T15:46:18.852Z  
> Project: **python-fastapi-complex**

## Critical Risks (Score ≥ 75)

_No critical-risk items detected._

## High Risks (Score 50–74)

- 🟠 **[P1]** Add positive api test for: Uncovered endpoint: GET /transfers/{transfer_id} — Score: 73
- 🟠 **[P1]** Add positive api test for: Uncovered endpoint: POST /auth/refresh — Score: 65
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /cards/{card_id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /cards/{card_id}/status — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /merchants/{merchant_id} — Score: 54
- 🟠 **[P2]** Add business rule test for: Uncovered business rule: BR-001 — Score: 52
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/balance — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/summary — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /limits/{account_id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /statements/{account_id}/{month} — Score: 51

## Risks by Category

### uncovered-endpoint

- 🔴 **[P1]** Add positive api test for: Uncovered endpoint: GET /transfers/{transfer_id} — Score: 73
- 🔴 **[P1]** Add positive api test for: Uncovered endpoint: POST /auth/refresh — Score: 65
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /cards/{card_id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /cards/{card_id}/status — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /merchants/{merchant_id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/balance — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/summary — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /limits/{account_id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /statements/{account_id}/{month} — Score: 51

### missing-business-rule-test

- 🟠 **[P2]** Add business rule test for: Uncovered business rule: BR-001 — Score: 52

## Risks by Endpoint

### `GET /transfers/{transfer_id}`

- 🔴 **[P1]** Add positive api test for: Uncovered endpoint: GET /transfers/{transfer_id} — Score: 73

### `POST /auth/refresh`

- 🔴 **[P1]** Add positive api test for: Uncovered endpoint: POST /auth/refresh — Score: 65

### `DELETE /cards/{card_id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /cards/{card_id} — Score: 54

### `PUT /cards/{card_id}/status`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /cards/{card_id}/status — Score: 54

### `GET /merchants/{merchant_id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /merchants/{merchant_id} — Score: 54

### `GET /accounts/{account_id}/balance`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/balance — Score: 51

### `GET /accounts/{account_id}/summary`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /accounts/{account_id}/summary — Score: 51

### `PUT /limits/{account_id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /limits/{account_id} — Score: 51

### `GET /statements/{account_id}/{month}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /statements/{account_id}/{month} — Score: 51
