# Ruby on Rails Complex Example
## User Management & Subscription Billing API

This example demonstrates how to use the **API Tests Coverage Analyzer** on a realistic Ruby on Rails API application.

The application implements a complete SaaS billing and user management API with **22 endpoints** across 11 resource types.

---

## The Coverage Journey: 50% to 100%

This example is designed to walk you through the analyzer's workflow by providing two test suites at different coverage levels.

### Step 1: Analyze Your Baseline (spec-initial, ~50% coverage)

```bash
api-coverage analyze \
  --config config.yaml \
  --test-dir spec/requests/spec-initial
```

The analyzer will report something like:

```
Endpoint Coverage: 52%

Covered (9/22):
  POST /api/v1/users
  GET  /api/v1/users
  GET  /api/v1/users/:id
  PUT  /api/v1/users/:id
  POST /api/v1/subscriptions
  GET  /api/v1/subscriptions/:id
  PUT  /api/v1/subscriptions/:id

Uncovered (13/22):
  DELETE /api/v1/users/:id              <-- Business Rule: user-deletion-requires-admin
  GET    /api/v1/subscriptions/:id/upgrade
  POST   /api/v1/subscriptions/:id/cancel <-- Business Rule: subscription-cancellation-period
  DELETE /api/v1/subscriptions/:id
  GET    /api/v1/invoices
  GET    /api/v1/invoices/:id
  POST   /api/v1/invoices/:id/pay       <-- Business Rule: invoice-payment-window
  GET    /api/v1/usage/:subscription_id
  POST   /api/v1/usage/record           <-- Business Rule: usage-quota-enforcement
  GET    /api/v1/seats ...
  POST   /api/v1/coupons/validate       <-- Business Rule: coupon-single-use
  GET    /api/v1/admin/health
  GET    /api/v1/admin/stats

Business Rules Uncovered:
  user-deletion-requires-admin (0/3 tests)
  subscription-cancellation-period (0/3 tests)
  invoice-payment-window (0/3 tests)
  coupon-single-use (0/3 tests)
  usage-quota-enforcement (0/2 tests)
  subscription-downgrade-seats (0/2 tests)
  seat-limit-per-plan (0/3 tests)
```

### Step 2: Use the Analyzer's Guidance

The analyzer generates a prioritized list of missing tests, referencing your `business-rules.yaml` and `integration-flows.yaml` to provide context.

Example output:

```
HIGH PRIORITY - Missing Business Rule Tests:

1. user-deletion-requires-admin
   Add to: spec/requests/spec-complete/users_spec.rb

   describe "DELETE /api/v1/users/:id" do
     context "as a non-admin" do
       it "returns 403" do
         delete "/api/v1/users/#{user.id}", headers: non_admin_headers
         expect(response).to have_http_status(:forbidden)
       end
     end
   end

2. invoice-payment-window (30 days)
   Add to: spec/requests/spec-complete/invoices_spec.rb

   context "with an overdue invoice" do
     it "returns 422" do
       ...
     end
   end
```

### Step 3: Full Coverage (spec-complete, 100%)

```bash
api-coverage analyze \
  --config config.yaml \
  --test-dir spec/requests/spec-complete
```

Output:

```
Endpoint Coverage: 100% (22/22)
Business Rule Coverage: 100% (8/8 rules, 28/28 test cases)
Error Scenario Coverage: 100%
Auth Flow Coverage: 100%

Integration Flows:
  FLOW001: User Registration and Subscription - COVERED
  FLOW002: Plan Upgrade Flow - COVERED
  FLOW003: Invoice Payment - COVERED
  FLOW004: Seat Management - COVERED
  FLOW005: Subscription Cancellation - COVERED
```

---

## Application Structure

### Resources and Endpoints

| Resource | Endpoints | Business Rules |
|----------|-----------|----------------|
| Users | GET /users, POST /users, GET /users/:id, PUT /users/:id, DELETE /users/:id | user-deletion-requires-admin |
| Subscriptions | POST, GET/:id, PUT/:id, DELETE/:id, GET/:id/upgrade, POST/:id/cancel | subscription-cancellation-period, subscription-downgrade-seats |
| Invoices | GET, GET/:id, POST/:id/pay | invoice-payment-window |
| Usage | GET /:subscription_id, POST /record | active-subscription-required, usage-quota-enforcement |
| Seats | GET, POST, DELETE/:id | seat-limit-per-plan |
| Plans | GET, GET/:id | - |
| Coupons | POST /validate | coupon-single-use |
| Audit Logs | GET | - |
| Webhooks | POST | - |
| Admin | GET /health, GET /stats | admin-only |

### Business Rules

Eight business rules are enforced and tested:

1. **user-deletion-requires-admin** - Only admin role can delete users
2. **active-subscription-required** - Usage features require active subscription
3. **seat-limit-per-plan** - Seats cannot exceed plan's defined limit
4. **invoice-payment-window** - Invoices must be paid within 30 days
5. **coupon-single-use** - Single-use coupons can only be applied once per account
6. **subscription-cancellation-period** - Cancellations take effect at period end (via POST /cancel)
7. **usage-quota-enforcement** - Usage cannot exceed plan quota per billing period
8. **subscription-downgrade-seats** - Downgrading to lower-seat plan auto-removes excess seats

---

## Quick Start

### Prerequisites

- Ruby 3.2+
- PostgreSQL 15+
- Redis 7+
- Node.js 18+ (for the analyzer)

### Setup

```bash
bundle install
bundle exec rails db:create db:migrate db:seed
bundle exec rails server
```

### Run Tests

Run the baseline spec suite (~50% coverage):

```bash
bundle exec rspec spec/requests/spec-initial --format documentation
```

Run the complete spec suite (100% coverage):

```bash
bundle exec rspec spec/requests/spec-complete --format documentation
```

### Run Coverage Analysis

Analyze the spec-initial baseline:

```bash
api-coverage analyze \
  --config config.yaml \
  --test-dir spec/requests/spec-initial \
  --output-dir coverage-reports/initial
```

Analyze the spec-complete full coverage:

```bash
api-coverage analyze \
  --config config.yaml \
  --test-dir spec/requests/spec-complete \
  --output-dir coverage-reports/complete
```

Open `coverage-reports/complete/index.html` in your browser to view the interactive report.

---

## RSpec Patterns

The analyzer recognizes several RSpec patterns for endpoint detection:

### Direct URL String Pattern

```ruby
describe "POST /api/v1/users" do
  it "creates a user" do
    post "/api/v1/users", params: { ... }, headers: auth_headers
    expect(response).to have_http_status(:created)
  end
end
```

### Helper Method Pattern with Constants

```ruby
module ApiHelpers
  USERS_PATH = "/api/v1/users"
  SUBSCRIPTIONS_PATH = "/api/v1/subscriptions"

  def create_subscription(plan, headers)
    post SUBSCRIPTIONS_PATH, params: { subscription: { plan_id: plan.id } }, headers: headers
  end
end
```

### Dynamic Path Helper Pattern

```ruby
def subscription_cancel_path(id)
  "/api/v1/subscriptions/#{id}/cancel"
end

it "cancels at period end" do
  post subscription_cancel_path(subscription.id), headers: auth_headers
  expect(response).to have_http_status(:ok)
end
```

---

## Integration Flows

The `integration-flows.yaml` file documents five end-to-end user journeys:

- **FLOW001**: User Registration and Subscription (new user onboarding with trial)
- **FLOW002**: Plan Upgrade Flow (including seat auto-removal on downgrade)
- **FLOW003**: Invoice Payment (including overdue/already-paid error paths)
- **FLOW004**: Seat Management (adding seats, hitting limit, removing seats)
- **FLOW005**: Subscription Cancellation (grace period vs. immediate cancellation)

---

## CI/CD Integration

### GitHub Actions

See `.github/workflows/analyze.yml` for a complete pipeline that:
1. Runs RSpec tests against PostgreSQL and Redis
2. Runs the analyzer on both spec-initial and spec-complete
3. Posts a coverage summary as a PR comment
4. Enforces 100% coverage as a required check

### Jenkins

See `Jenkinsfile` for a declarative pipeline with:
- Docker agent with Ruby 3.2
- PostgreSQL and Redis service containers
- HTML coverage reports published to Jenkins
- Coverage gate that fails the build below threshold

---

## Directory Reference

```
app/controllers/api/v1/    # 11 API controllers
app/models/                # 8 domain models
app/services/              # BillingService, SubscriptionService, UsageService
app/helpers/               # ApiHelper, PathHelper
config/routes.rb           # Rails router (22 endpoints)
spec/requests/spec-initial/  # ~50% coverage (users + subscriptions only)
spec/requests/spec-complete/ # 100% coverage (all endpoints + error + security)
openapi.yaml               # OpenAPI 3.0 specification
business-rules.yaml        # 8 business rules with test requirements
integration-flows.yaml     # 5 end-to-end integration flows
config.yaml                # Analyzer configuration
```
