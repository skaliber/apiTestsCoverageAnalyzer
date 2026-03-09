# frozen_string_literal: true

# routes.rb - Sinatra application route definitions
#
# This file defines the payment processing API server used for local development
# and integration testing. It mirrors the routes declared in openapi.yaml and
# path_constants.rb.
#
# Run: bundle exec ruby app/routes.rb
# The Cucumber test suite targets this server at http://localhost:4567

require "sinatra/base"
require "sinatra/json"
require "json"
require "securerandom"
require "openssl"
require "time"

class PaymentPlatformApp < Sinatra::Base
  set :port, ENV.fetch("PORT", 4567)
  set :bind, "0.0.0.0"
  set :show_exceptions, false

  # In-memory store for demo/testing (not for production)
  STORE = {
    payments: {},
    refunds:  {},
    disputes: {},
    accounts: {},
    webhooks: {}
  }.freeze

  before do
    content_type :json
    request.body.rewind
    @body = JSON.parse(request.body.read) rescue {}
  end

  # ─── Authentication Middleware ──────────────────────────────────────────────

  before do
    next if request.path_info == "/admin/health"
    next if request.path_info.start_with?("/test/")

    auth_header = request.env["HTTP_AUTHORIZATION"]
    halt 401, json(error_code: "AUTHENTICATION_REQUIRED", message: "API key required") if auth_header.nil?
    halt 401, json(error_code: "API_KEY_EXPIRED",         message: "API key expired") if auth_header.include?("expired-key")
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # PAYMENT ENDPOINTS
  # ═══════════════════════════════════════════════════════════════════════════

  # POST /payments - Create a new payment authorization
  post "/payments" do
    status 201
    merchant_id = request.env["HTTP_X_MERCHANT_ID"]

    account = STORE[:accounts][merchant_id] || { status: "active" }
    if account[:status] == "suspended"
      halt 403, json(error_code: "ACCOUNT_INACTIVE", message: "Account is not active")
    end

    amount   = @body["amount"]
    order_id = @body["order_id"]

    halt 400, json(error_code: "VALIDATION_ERROR", message: "amount is required",
                   errors: [{ field: "amount", message: "is required" }]) if amount.nil?
    halt 422, json(error_code: "INVALID_AMOUNT", message: "amount must be positive") if amount.to_f <= 0

    if (idem_key = @body["idempotency_key"])
      existing = STORE[:payments].values.find { |p| p[:idempotency_key] == idem_key }
      halt 409, json(existing.merge(error_code: "DUPLICATE_PAYMENT")) if existing
    end

    payment_id = @body["forced_id"] || "PAY-#{SecureRandom.hex(6).upcase}"
    payment = {
      payment_id:       payment_id,
      amount:           amount.to_f,
      currency:         @body["currency"] || "USD",
      order_id:         order_id,
      status:           "authorized",
      merchant_id:      merchant_id,
      idempotency_key:  @body["idempotency_key"],
      captured_amount:  nil,
      total_refunded:   0.0,
      flags:            [],
      funds_on_hold:    false,
      created_at:       Time.now.iso8601
    }
    STORE[:payments][payment_id] = payment
    json payment
  end

  # GET /payments - List payments
  get "/payments" do
    merchant_id = request.env["HTTP_X_MERCHANT_ID"]
    page_size   = (params["page_size"] || 20).to_i
    page        = (params["page"] || 1).to_i

    all = STORE[:payments].values.select { |p| p[:merchant_id] == merchant_id }
    paginated = all[(page - 1) * page_size, page_size] || []
    json(
      data:       paginated,
      pagination: { total: all.length, page: page, per_page: page_size }
    )
  end

  # GET /payments/:id - Retrieve a specific payment
  get "/payments/:id" do
    payment = STORE[:payments][params[:id]]
    halt 404, json(error_code: "PAYMENT_NOT_FOUND", message: "Payment not found") unless payment
    json payment
  end

  # POST /payments/:id/capture - Capture an authorized payment
  post "/payments/:id/capture" do
    payment = STORE[:payments][params[:id]]
    halt 404, json(error_code: "PAYMENT_NOT_FOUND", message: "Payment not found") unless payment

    unless payment[:status] == "authorized"
      halt 422, json(
        error_code: payment[:status] == "captured" ? "INVALID_STATE_TRANSITION" : "VOID_NOT_ALLOWED",
        message:    "Payment is already #{payment[:status]}; only authorized payments can be captured"
      )
    end

    capture_amount = @body["amount"] ? @body["amount"].to_f : payment[:amount]
    payment[:status]          = "captured"
    payment[:captured_amount] = capture_amount
    json payment
  end

  # POST /payments/:id/void - Void an authorized payment
  post "/payments/:id/void" do
    payment = STORE[:payments][params[:id]]
    halt 404, json(error_code: "PAYMENT_NOT_FOUND", message: "Payment not found") unless payment

    unless payment[:status] == "authorized"
      halt 422, json(
        error_code: "VOID_NOT_ALLOWED",
        message:    "captured payments cannot be voided; only authorized payments can be voided"
      )
    end

    payment[:status] = "voided"
    json payment
  end

  # POST /payments/:id/refund - Refund via payment resource
  post "/payments/:id/refund" do
    payment = STORE[:payments][params[:id]]
    halt 404, json(error_code: "PAYMENT_NOT_FOUND", message: "Payment not found") unless payment

    unless payment[:status] == "captured"
      halt 422, json(
        error_code: "REFUND_NOT_ALLOWED",
        message:    "only captured payments can be refunded"
      )
    end

    amount = @body["amount"].to_f
    remaining = payment[:amount] - payment[:total_refunded]
    halt 422, json(error_code: "REFUND_EXCEEDS_REMAINING") if amount > remaining

    refund_id = "REF-#{SecureRandom.hex(6).upcase}"
    refund = { refund_id: refund_id, payment_id: payment[:payment_id],
               amount: amount, status: "pending", created_at: Time.now.iso8601 }
    STORE[:refunds][refund_id] = refund
    payment[:total_refunded] += amount
    payment[:status] = "refunded" if payment[:total_refunded] >= payment[:amount]
    status 201
    json refund
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # REFUND ENDPOINTS
  # ═══════════════════════════════════════════════════════════════════════════

  # POST /refunds - Create a standalone refund
  post "/refunds" do
    payment_id = @body["payment_id"]
    payment    = STORE[:payments][payment_id]
    halt 404, json(error_code: "PAYMENT_NOT_FOUND", message: "Payment not found") unless payment

    unless payment[:status] == "captured"
      halt 422, json(
        error_code: "REFUND_NOT_ALLOWED",
        message:    "only captured payments can be refunded"
      )
    end

    amount    = @body["amount"].to_f
    remaining = payment[:amount] - payment[:total_refunded]

    halt 422, json(error_code: "REFUND_EXCEEDS_ORIGINAL",
                   message: "refund amount exceeds original payment") if amount > payment[:amount]
    halt 422, json(error_code: "REFUND_EXCEEDS_REMAINING")            if amount > remaining

    refund_id = "REF-#{SecureRandom.hex(6).upcase}"
    refund = {
      refund_id:  refund_id,
      payment_id: payment_id,
      amount:     amount,
      reason:     @body["reason"],
      metadata:   @body["metadata"],
      status:     "pending",
      created_at: Time.now.iso8601
    }
    STORE[:refunds][refund_id] = refund
    payment[:total_refunded] += amount
    status 201
    json refund
  end

  # GET /refunds/:id - Retrieve a specific refund
  get "/refunds/:id" do
    refund = STORE[:refunds][params[:id]]
    halt 404, json(error_code: "REFUND_NOT_FOUND", message: "Refund not found") unless refund
    json refund
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # DISPUTE ENDPOINTS
  # ═══════════════════════════════════════════════════════════════════════════

  # POST /disputes - Open a new dispute
  post "/disputes" do
    payment_id = @body["payment_id"]
    dispute_id = "DSP-#{SecureRandom.hex(6).upcase}"
    dispute = {
      dispute_id:        dispute_id,
      payment_id:        payment_id,
      reason:            @body["reason"] || "chargeback",
      status:            "open",
      response_deadline: (Time.now + 7 * 24 * 60 * 60).iso8601,
      created_at:        Time.now.iso8601
    }
    STORE[:disputes][dispute_id] = dispute

    # Flag the payment as disputed
    if (payment = STORE[:payments][payment_id])
      payment[:flags] ||= []
      payment[:flags] << "disputed"
      payment[:funds_on_hold] = true
    end

    status 201
    json dispute
  end

  # GET /disputes - List disputes
  get "/disputes" do
    merchant_id = request.env["HTTP_X_MERCHANT_ID"]
    disputes    = STORE[:disputes].values
    disputes    = disputes.select { |d| d[:status] == params["status"] } if params["status"]
    json(data: disputes)
  end

  # GET /disputes/:id - Retrieve a specific dispute
  get "/disputes/:id" do
    dispute = STORE[:disputes][params[:id]]
    halt 404, json(error_code: "DISPUTE_NOT_FOUND", message: "Dispute not found") unless dispute
    json dispute
  end

  # PUT /disputes/:id/respond - Submit a dispute response
  put "/disputes/:id/respond" do
    dispute = STORE[:disputes][params[:id]]
    halt 404, json(error_code: "DISPUTE_NOT_FOUND", message: "Dispute not found") unless dispute

    halt 422, json(error_code: "DISPUTE_ALREADY_RESOLVED",
                   message: "Dispute has already been resolved") unless dispute[:status] == "open"

    deadline = Time.parse(dispute[:response_deadline])
    if Time.now > deadline
      halt 422, json(
        error_code: "DISPUTE_WINDOW_EXPIRED",
        message:    "response window of 7 days has passed"
      )
    end

    dispute[:status]    = @body["type"] == "full_counter_claim" ? "disputed" : "under_review"
    dispute[:response]  = @body
    dispute[:responded_at] = Time.now.iso8601
    json dispute
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # ACCOUNT ENDPOINTS
  # ═══════════════════════════════════════════════════════════════════════════

  # GET /accounts - List all accounts (admin only)
  get "/accounts" do
    admin = request.env["HTTP_X_ADMIN_ACCESS"]
    halt 403, json(error_code: "ADMIN_ACCESS_REQUIRED") unless admin
    json(data: STORE[:accounts].values)
  end

  # GET /accounts/:id - Retrieve account details
  get "/accounts/:id" do
    requesting_merchant = request.env["HTTP_X_MERCHANT_ID"]
    is_admin            = request.env["HTTP_X_ADMIN_ACCESS"]

    unless is_admin || requesting_merchant == params[:id]
      halt 403, json(error_code: "ACCESS_DENIED", message: "You cannot access another merchant's account")
    end

    account = STORE[:accounts][params[:id]] || {
      merchant_id: params[:id],
      status:      "active",
      currency:    "USD",
      created_at:  Time.now.iso8601
    }
    json account
  end

  # GET /accounts/:id/balance - Get account balance
  get "/accounts/:id/balance" do
    account = STORE[:accounts][params[:id]] || { available_balance: 0.0, currency: "USD" }
    json(
      merchant_id:       params[:id],
      available_balance: account[:balance] || 0.0,
      currency:          account[:currency] || "USD",
      last_updated:      Time.now.iso8601
    )
  end

  # PATCH /accounts/:id/limits - Update transaction limits
  patch "/accounts/:id/limits" do
    limits_max = 999_999.99
    per_txn    = @body["per_transaction"]&.to_f

    if per_txn && per_txn > limits_max
      halt 422, json(error_code: "LIMIT_EXCEEDS_MAXIMUM", message: "Limit exceeds platform maximum")
    end

    account = STORE[:accounts][params[:id]] || {}
    account[:limits]     = @body
    account[:updated_at] = Time.now.iso8601
    STORE[:accounts][params[:id]] = account
    json(limits: @body, updated_at: account[:updated_at])
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # WEBHOOK ENDPOINTS
  # ═══════════════════════════════════════════════════════════════════════════

  # POST /webhooks - Register a webhook endpoint
  post "/webhooks" do
    url    = @body["url"]
    events = @body["events"] || []

    valid_events = %w[payment.authorized payment.captured payment.voided payment.refunded
                      refund.created dispute.opened dispute.resolved]

    halt 422, json(error_code: "INVALID_WEBHOOK_URL",   message: "URL is not valid") unless url =~ /\Ahttps?:\/\//
    events.each do |event|
      halt 422, json(error_code: "UNKNOWN_EVENT_TYPE", message: "Unknown event '#{event}'") unless valid_events.include?(event)
    end

    webhook_id = "WH-#{SecureRandom.hex(6).upcase}"
    secret     = SecureRandom.hex(32)
    webhook = {
      webhook_id:  webhook_id,
      url:         url,
      events:      events,
      status:      "active",
      secret:      secret,
      merchant_id: @body["merchant_id"],
      created_at:  Time.now.iso8601
    }
    STORE[:webhooks][webhook_id] = webhook
    status 201
    json webhook
  end

  # GET /webhooks - List webhooks
  get "/webhooks" do
    json(data: STORE[:webhooks].values)
  end

  # GET /webhooks/:id - Retrieve a webhook
  get "/webhooks/:id" do
    webhook = STORE[:webhooks][params[:id]]
    halt 404, json(error_code: "WEBHOOK_NOT_FOUND") unless webhook
    json webhook
  end

  # DELETE /webhooks/:id - Remove a webhook
  delete "/webhooks/:id" do
    webhook = STORE[:webhooks].delete(params[:id])
    halt 404, json(error_code: "WEBHOOK_NOT_FOUND") unless webhook
    status 204
  end

  # POST /webhooks/:id/rotate-secret - Rotate the HMAC signing secret
  post "/webhooks/:id/rotate-secret" do
    webhook = STORE[:webhooks][params[:id]]
    halt 404, json(error_code: "WEBHOOK_NOT_FOUND") unless webhook
    webhook[:secret] = SecureRandom.hex(32)
    json(secret: webhook[:secret], rotated_at: Time.now.iso8601)
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # ADMIN ENDPOINTS
  # ═══════════════════════════════════════════════════════════════════════════

  # GET /admin/health - Platform health check
  get "/admin/health" do
    json(
      status:    "healthy",
      timestamp: Time.now.iso8601,
      version:   "1.0.0",
      services:  {
        database:     "up",
        card_network: "up",
        cache:        "up"
      }
    )
  end

  # GET /admin/stats - Platform statistics (admin only)
  get "/admin/stats" do
    admin = request.env["HTTP_X_ADMIN_ACCESS"]
    halt 403, json(error_code: "ADMIN_ACCESS_REQUIRED", message: "Admin access required") unless admin

    json(
      total_payments_processed: STORE[:payments].size,
      total_refunds_issued:     STORE[:refunds].size,
      total_disputes_opened:    STORE[:disputes].size,
      active_webhooks:          STORE[:webhooks].count { |_, w| w[:status] == "active" },
      generated_at:             Time.now.iso8601
    )
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # TEST HELPER ENDPOINTS (available in test environment only)
  # ═══════════════════════════════════════════════════════════════════════════

  post "/test/reset" do
    merchant_id = @body["merchant_id"]
    STORE[:payments].delete_if { |_, p| p[:merchant_id] == merchant_id }
    STORE[:refunds].delete_if  { |_, r| r[:merchant_id] == merchant_id }
    STORE[:disputes].delete_if { |_, d| d[:merchant_id] == merchant_id }
    status 204
  end

  patch "/test/accounts/:id/balance" do
    account = STORE[:accounts][params[:id]] || {}
    account[:balance]  = @body["balance"].to_f
    account[:currency] = "USD"
    STORE[:accounts][params[:id]] = account
    status 204
  end

  patch "/test/accounts/:id/status" do
    account = STORE[:accounts][params[:id]] || {}
    account[:status] = @body["status"]
    STORE[:accounts][params[:id]] = account
    status 204
  end

  patch "/test/disputes/:id/deadline" do
    dispute = STORE[:disputes][params[:id]]
    halt 404 unless dispute
    days   = @body["days_from_now"].to_i
    dispute[:response_deadline] = (Time.now + days * 24 * 60 * 60).iso8601
    status 204
  end

  get "/test/webhooks/:id/deliveries" do
    json([])
  end

  # ─── Error Handlers ────────────────────────────────────────────────────────

  error 404 do
    json(error_code: "NOT_FOUND", message: "Resource not found")
  end

  error 405 do
    json(error_code: "METHOD_NOT_ALLOWED", message: "HTTP method not allowed")
  end

  error 500 do
    json(error_code: "INTERNAL_ERROR", message: "An unexpected error occurred")
  end

  run! if __FILE__ == $PROGRAM_NAME
end
