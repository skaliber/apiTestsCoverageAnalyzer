# frozen_string_literal: true

# path_constants.rb - Central registry of all API endpoint path templates
#
# The api-test-coverage-analyzer resolves endpoint coverage by tracing:
#   1. Gherkin step in .feature file
#   2. Step definition calling ApiHelper method
#   3. ApiHelper method referencing a PathConstant
#   4. PathConstant providing the URL template
#   5. HTTP client executing the request
#
# Path templates use :param notation for path parameters, which are
# replaced at runtime using .gsub(":param", actual_value).

module PathConstants
  # ─── Payment Endpoints ────────────────────────────────────────────────────
  # POST /payments          - Create a new payment authorization
  # GET  /payments          - List payments (with pagination & filtering)
  PAYMENTS_PATH = "/payments"

  # GET    /payments/:id    - Retrieve a specific payment by ID
  # (no separate constant needed; built dynamically from PAYMENT_PATH)
  PAYMENT_PATH = "/payments/:id"

  # POST /payments/:id/capture  - Capture an authorized payment
  PAYMENT_CAPTURE_PATH = "/payments/:id/capture"

  # POST /payments/:id/void     - Void an authorized payment
  PAYMENT_VOID_PATH = "/payments/:id/void"

  # POST /payments/:id/refund   - Create a refund via the payment resource
  PAYMENT_REFUND_PATH = "/payments/:id/refund"

  # ─── Refund Endpoints ─────────────────────────────────────────────────────
  # POST /refunds           - Create a standalone refund
  REFUNDS_PATH = "/refunds"

  # GET /refunds/:id        - Retrieve a specific refund
  REFUND_PATH = "/refunds/:id"

  # ─── Dispute Endpoints ────────────────────────────────────────────────────
  # POST /disputes          - Open a new dispute
  # GET  /disputes          - List disputes
  DISPUTES_PATH = "/disputes"

  # GET /disputes/:id       - Retrieve a specific dispute
  DISPUTE_PATH = "/disputes/:id"

  # PUT /disputes/:id/respond  - Submit a response/evidence for a dispute
  DISPUTE_RESPOND_PATH = "/disputes/:id/respond"

  # ─── Account Endpoints ────────────────────────────────────────────────────
  # GET /accounts/:id       - Retrieve account details
  ACCOUNT_PATH = "/accounts/:id"

  # GET /accounts/:id/balance   - Retrieve current account balance
  BALANCE_PATH = "/accounts/:id/balance"

  # PATCH /accounts/:id/limits  - Update transaction limits for an account
  ACCOUNT_LIMITS_PATH = "/accounts/:id/limits"

  # GET /accounts           - List all accounts (admin only)
  ACCOUNTS_PATH = "/accounts"

  # ─── Webhook Endpoints ────────────────────────────────────────────────────
  # POST /webhooks          - Register a new webhook endpoint
  # GET  /webhooks          - List registered webhooks
  WEBHOOKS_PATH = "/webhooks"

  # GET    /webhooks/:id    - Retrieve a specific webhook configuration
  # DELETE /webhooks/:id    - Remove a webhook registration
  WEBHOOK_PATH = "/webhooks/:id"

  # POST /webhooks/:id/rotate-secret  - Rotate the HMAC signing secret
  WEBHOOK_ROTATE_SECRET_PATH = "/webhooks/:id/rotate-secret"

  # ─── Admin Endpoints ──────────────────────────────────────────────────────
  # GET /admin/health       - Platform health check (publicly accessible)
  HEALTH_PATH = "/admin/health"

  # GET /admin/stats        - Platform-wide statistics (admin only)
  STATS_PATH = "/admin/stats"

  # ─── Helper: Build path with substituted parameter ────────────────────────
  def self.with_id(path_template, id)
    path_template.gsub(":id", id.to_s)
  end
end
