# Risk Prioritization Report

> Generated: 2026-03-11T15:43:32.132Z  
> Project: **ruby-rails-complex**

## Critical Risks (Score ≥ 75)

_No critical-risk items detected._

## High Risks (Score 50–74)

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /subscriptions/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{id}/upgrade — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions/{id}/cancel — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /invoices — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /invoices/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /invoices/{id}/pay — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /usage/{subscription_id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /usage/record — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{subscription_id}/seats — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions/{subscription_id}/seats — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{subscription_id}/seats/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /plans — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /plans/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /coupons/validate — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /audit-logs — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /webhooks — Score: 54
- 🟠 **[P2]** Add business rule test for: Uncovered business rule: user-deletion-requires-admin — Score: 52
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /users — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /users — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /users/{id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /users/{id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /users/{id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /admin/health — Score: 50
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /admin/stats — Score: 50

## Risks by Category

### uncovered-endpoint

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /subscriptions/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{id}/upgrade — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions/{id}/cancel — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /invoices — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /invoices/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /invoices/{id}/pay — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /usage/{subscription_id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /usage/record — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{subscription_id}/seats — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions/{subscription_id}/seats — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{subscription_id}/seats/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /plans — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /plans/{id} — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /coupons/validate — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /audit-logs — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /webhooks — Score: 54
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /users — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /users — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /users/{id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /users/{id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /users/{id} — Score: 51
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /admin/health — Score: 50
- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /admin/stats — Score: 50

### missing-business-rule-test

- 🟠 **[P2]** Add business rule test for: Uncovered business rule: user-deletion-requires-admin — Score: 52

## Risks by Endpoint

### `POST /subscriptions`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions — Score: 54

### `GET /subscriptions/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{id} — Score: 54

### `PUT /subscriptions/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /subscriptions/{id} — Score: 54

### `DELETE /subscriptions/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{id} — Score: 54

### `GET /subscriptions/{id}/upgrade`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{id}/upgrade — Score: 54

### `POST /subscriptions/{id}/cancel`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions/{id}/cancel — Score: 54

### `GET /invoices`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /invoices — Score: 54

### `GET /invoices/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /invoices/{id} — Score: 54

### `POST /invoices/{id}/pay`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /invoices/{id}/pay — Score: 54

### `GET /usage/{subscription_id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /usage/{subscription_id} — Score: 54

### `POST /usage/record`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /usage/record — Score: 54

### `GET /subscriptions/{subscription_id}/seats`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /subscriptions/{subscription_id}/seats — Score: 54

### `POST /subscriptions/{subscription_id}/seats`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /subscriptions/{subscription_id}/seats — Score: 54

### `DELETE /subscriptions/{subscription_id}/seats/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /subscriptions/{subscription_id}/seats/{id} — Score: 54

### `GET /plans`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /plans — Score: 54

### `GET /plans/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /plans/{id} — Score: 54

### `POST /coupons/validate`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /coupons/validate — Score: 54

### `GET /audit-logs`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /audit-logs — Score: 54

### `POST /webhooks`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /webhooks — Score: 54

### `GET /users`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /users — Score: 51

### `POST /users`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: POST /users — Score: 51

### `GET /users/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /users/{id} — Score: 51

### `PUT /users/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: PUT /users/{id} — Score: 51

### `DELETE /users/{id}`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: DELETE /users/{id} — Score: 51

### `GET /admin/health`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /admin/health — Score: 50

### `GET /admin/stats`

- 🟠 **[P2]** Add positive api test for: Uncovered endpoint: GET /admin/stats — Score: 50
