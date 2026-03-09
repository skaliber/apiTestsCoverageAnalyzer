# frozen_string_literal: true

# api_helper.rb - API helper classes for each resource domain
#
# These helpers are the central integration point between step definitions
# and the HTTP client. Each class:
#   - includes PathConstants to reference URL templates
#   - substitutes path parameters at call time
#   - delegates to ApiClient for actual HTTP execution
#
# The api-test-coverage-analyzer traces the call chain:
#   step definition -> Helper.method -> PathConstants::SOME_PATH -> HTTP verb

require_relative "path_constants"

# ─── Base HTTP client wrapper ─────────────────────────────────────────────────

class ApiClient
  @base_url = ENV.fetch("API_BASE_URL", "http://localhost:4567")
  @default_headers = {
    "Content-Type" => "application/json",
    "Accept"       => "application/json"
  }

  class << self
    attr_reader :base_url, :default_headers

    def configure(headers: {})
      @default_headers = @default_headers.merge(headers)
    end

    def get(path, params: {})
      url = "#{base_url}#{path}"
      RestClient::Request.execute(
        method:  :get,
        url:     url,
        headers: default_headers.merge(params: params)
      )
    rescue RestClient::ExceptionWithResponse => e
      e.response
    end

    def post(path, body: nil)
      url = "#{base_url}#{path}"
      RestClient::Request.execute(
        method:  :post,
        url:     url,
        payload: body.to_json,
        headers: default_headers
      )
    rescue RestClient::ExceptionWithResponse => e
      e.response
    end

    def put(path, body: nil)
      url = "#{base_url}#{path}"
      RestClient::Request.execute(
        method:  :put,
        url:     url,
        payload: body.to_json,
        headers: default_headers
      )
    rescue RestClient::ExceptionWithResponse => e
      e.response
    end

    def patch(path, body: nil)
      url = "#{base_url}#{path}"
      RestClient::Request.execute(
        method:  :patch,
        url:     url,
        payload: body.to_json,
        headers: default_headers
      )
    rescue RestClient::ExceptionWithResponse => e
      e.response
    end

    def delete(path)
      url = "#{base_url}#{path}"
      RestClient::Request.execute(
        method:  :delete,
        url:     url,
        headers: default_headers
      )
    rescue RestClient::ExceptionWithResponse => e
      e.response
    end
  end
end

# ─── Payment API Helper ───────────────────────────────────────────────────────

class PaymentApiHelper
  include PathConstants

  # POST /payments
  # Creates a new payment authorization.
  def self.create_payment(attrs = {})
    ApiClient.post(PathConstants::PAYMENTS_PATH, body: attrs)
  end

  # GET /payments
  # Lists payments with optional pagination and filtering parameters.
  def self.list_payments(page_size: 20, page: 1, status: nil)
    params = { page_size: page_size, page: page }
    params[:status] = status if status
    ApiClient.get(PathConstants::PAYMENTS_PATH, params: params)
  end

  # GET /payments/:id
  # Retrieves a specific payment by its unique identifier.
  def self.get_payment(id)
    path = PathConstants::PAYMENT_PATH.gsub(":id", id.to_s)
    ApiClient.get(path)
  end

  # POST /payments/:id/capture
  # Captures a previously authorized payment, optionally for a partial amount.
  def self.capture_payment(id, amount: nil)
    path = PathConstants::PAYMENT_CAPTURE_PATH.gsub(":id", id.to_s)
    body = amount ? { amount: amount } : {}
    ApiClient.post(path, body: body)
  end

  # POST /payments/:id/void
  # Voids an authorized (uncaptured) payment.
  def self.void_payment(id)
    path = PathConstants::PAYMENT_VOID_PATH.gsub(":id", id.to_s)
    ApiClient.post(path, body: {})
  end

  # POST /payments/:id/refund
  # Creates a refund directly via the payment resource endpoint.
  def self.refund_payment(id, amount:, reason: nil)
    path = PathConstants::PAYMENT_REFUND_PATH.gsub(":id", id.to_s)
    body = { amount: amount }
    body[:reason] = reason if reason
    ApiClient.post(path, body: body)
  end
end

# ─── Refund API Helper ────────────────────────────────────────────────────────

class RefundApiHelper
  include PathConstants

  # POST /refunds
  # Creates a standalone refund for a captured payment.
  def self.create_refund(payment_id:, amount:, reason: nil, metadata: nil)
    body = {
      payment_id: payment_id,
      amount:     amount
    }
    body[:reason]   = reason   if reason
    body[:metadata] = metadata if metadata
    ApiClient.post(PathConstants::REFUNDS_PATH, body: body)
  end

  # GET /refunds/:id
  # Retrieves a specific refund by its unique identifier.
  def self.get_refund(id)
    path = PathConstants::REFUND_PATH.gsub(":id", id.to_s)
    ApiClient.get(path)
  end
end

# ─── Dispute API Helper ───────────────────────────────────────────────────────

class DisputeApiHelper
  include PathConstants

  # POST /disputes
  # Opens a new dispute for a payment.
  def self.create_dispute(payment_id:, reason:)
    body = { payment_id: payment_id, reason: reason }
    ApiClient.post(PathConstants::DISPUTES_PATH, body: body)
  end

  # GET /disputes
  # Lists disputes with optional filters.
  def self.list_disputes(merchant_id: nil, status: nil)
    params = {}
    params[:merchant_id] = merchant_id if merchant_id
    params[:status]      = status      if status
    ApiClient.get(PathConstants::DISPUTES_PATH, params: params)
  end

  # GET /disputes/:id
  # Retrieves a specific dispute by its unique identifier.
  def self.get_dispute(id)
    path = PathConstants::DISPUTE_PATH.gsub(":id", id.to_s)
    ApiClient.get(path)
  end

  # PUT /disputes/:id/respond
  # Submits a merchant response with evidence for an open dispute.
  def self.respond_to_dispute(id, evidence = {})
    path = PathConstants::DISPUTE_RESPOND_PATH.gsub(":id", id.to_s)
    ApiClient.put(path, body: evidence)
  end
end

# ─── Account API Helper ───────────────────────────────────────────────────────

class AccountApiHelper
  include PathConstants

  # GET /accounts/:id
  # Retrieves account details for the specified merchant.
  def self.get_account(id)
    path = PathConstants::ACCOUNT_PATH.gsub(":id", id.to_s)
    ApiClient.get(path)
  end

  # GET /accounts/:id/balance
  # Retrieves the current available balance for a merchant account.
  def self.get_balance(id)
    path = PathConstants::BALANCE_PATH.gsub(":id", id.to_s)
    ApiClient.get(path)
  end

  # PATCH /accounts/:id/limits
  # Updates transaction limit policies for a merchant account.
  def self.update_limits(id, limits = {})
    path = PathConstants::ACCOUNT_LIMITS_PATH.gsub(":id", id.to_s)
    ApiClient.patch(path, body: limits)
  end
end

# ─── Webhook API Helper ───────────────────────────────────────────────────────

class WebhookApiHelper
  include PathConstants

  # POST /webhooks
  # Registers a new webhook endpoint for event notifications.
  def self.create_webhook(url:, events:, merchant_id: nil)
    body = { url: url, events: events }
    body[:merchant_id] = merchant_id if merchant_id
    ApiClient.post(PathConstants::WEBHOOKS_PATH, body: body)
  end

  # GET /webhooks
  # Lists all registered webhook endpoints.
  def self.list_webhooks
    ApiClient.get(PathConstants::WEBHOOKS_PATH)
  end

  # GET /webhooks/:id
  # Retrieves configuration for a specific webhook.
  def self.get_webhook(id)
    path = PathConstants::WEBHOOK_PATH.gsub(":id", id.to_s)
    ApiClient.get(path)
  end

  # DELETE /webhooks/:id
  # Removes a webhook registration.
  def self.delete_webhook(id)
    path = PathConstants::WEBHOOK_PATH.gsub(":id", id.to_s)
    ApiClient.delete(path)
  end

  # POST /webhooks/:id/rotate-secret
  # Generates a new HMAC signing secret for webhook signature validation.
  def self.rotate_secret(id)
    path = PathConstants::WEBHOOK_ROTATE_SECRET_PATH.gsub(":id", id.to_s)
    ApiClient.post(path, body: {})
  end
end

# ─── Admin API Helper ─────────────────────────────────────────────────────────

class AdminApiHelper
  include PathConstants

  # GET /admin/health
  # Returns the current health status of the payment platform.
  def self.health_check
    ApiClient.get(PathConstants::HEALTH_PATH)
  end

  # GET /admin/stats
  # Returns platform-wide statistics. Requires admin authorization.
  def self.get_stats
    ApiClient.get(PathConstants::STATS_PATH)
  end
end

# ─── Webhook Validator ────────────────────────────────────────────────────────

module WebhookValidator
  require "openssl"

  # Validates an incoming webhook payload against its HMAC-SHA256 signature.
  # Signature format expected: "sha256=<hex_digest>"
  def self.validate(payload:, signature:, secret:)
    return false if payload.nil? || signature.nil? || secret.nil?

    expected = generate_signature(payload, secret)
    Rack::Utils.secure_compare(expected, signature)
  rescue StandardError
    false
  end

  def self.generate_signature(payload, secret)
    digest = OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
    "sha256=#{digest}"
  end
end

# ─── Auth Helper ─────────────────────────────────────────────────────────────

module AuthHelper
  def self.merchant_auth_headers(merchant_id)
    api_key = TestEnvironment.api_key_for(merchant_id)
    { "Authorization" => "Bearer #{api_key}", "X-Merchant-ID" => merchant_id }
  end

  def self.admin_auth_headers
    { "Authorization" => "Bearer #{TestEnvironment.admin_api_key}", "X-Admin-Access" => "true" }
  end

  def self.readonly_auth_headers(merchant_id)
    api_key = TestEnvironment.readonly_api_key_for(merchant_id)
    { "Authorization" => "Bearer #{api_key}", "X-Merchant-ID" => merchant_id }
  end

  def self.expired_auth_headers
    { "Authorization" => "Bearer expired-key-00000000000000000000" }
  end
end
