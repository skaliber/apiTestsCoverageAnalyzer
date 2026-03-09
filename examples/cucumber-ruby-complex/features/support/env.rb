# frozen_string_literal: true

# env.rb - Cucumber test environment bootstrap
# Loaded automatically by Cucumber before any features run.

require "json"
require "rest-client"
require "openssl"
require "time"

# Optional VCR recording for offline/CI mode
begin
  require "vcr"
  require "webmock/rspec"

  VCR.configure do |config|
    config.cassette_library_dir = File.join(__dir__, "..", "..", "spec", "vcr_cassettes")
    config.hook_into :webmock
    config.configure_rspec_metadata!
    config.default_cassette_options = {
      record:                :new_episodes,
      re_record_interval:    7 * 24 * 60 * 60, # re-record every 7 days
      allow_playback_repeats: true
    }
    config.filter_sensitive_data("<API_KEY>") do |interaction|
      interaction.request.headers["Authorization"]&.first
    end
  end
rescue LoadError
  # VCR not available; run against live or test server
end

# Load support files in dependency order
require_relative "path_constants"
require_relative "api_helper"

# ─── Test Environment Configuration ──────────────────────────────────────────

module TestEnvironment
  BASE_URL           = ENV.fetch("API_BASE_URL", "http://localhost:4567")
  TEST_MERCHANT_ID   = ENV.fetch("TEST_MERCHANT_ID", "MERCH-TEST-001")
  ADMIN_MERCHANT_ID  = ENV.fetch("ADMIN_MERCHANT_ID", "MERCH-ADMIN-000")

  DEFAULT_API_KEY        = ENV.fetch("TEST_API_KEY",        "sk_test_merchant_live_key_abc123")
  ADMIN_API_KEY          = ENV.fetch("ADMIN_API_KEY",        "sk_admin_secret_key_xyz789")
  READONLY_API_KEY       = ENV.fetch("READONLY_API_KEY",     "sk_test_readonly_key_def456")

  def self.current_merchant_id
    TEST_MERCHANT_ID
  end

  def self.admin_merchant_id
    ADMIN_MERCHANT_ID
  end

  def self.api_key_for(_merchant_id)
    DEFAULT_API_KEY
  end

  def self.admin_api_key
    ADMIN_API_KEY
  end

  def self.readonly_api_key_for(_merchant_id)
    READONLY_API_KEY
  end

  def self.simulate_downstream_timeout(enabled)
    ApiClient.instance_variable_set(:@simulate_timeout, enabled)
  end
end

# ─── Test Helper Utilities ────────────────────────────────────────────────────

module PaymentTestHelper
  def self.create_payment_with_status(status, amount: 100.00, merchant_id: TestEnvironment.current_merchant_id)
    response = PaymentApiHelper.create_payment(
      amount:      amount,
      currency:    "USD",
      order_id:    "ORD-SETUP-#{SecureRandom.hex(4).upcase}",
      customer_id: merchant_id
    )
    payment = JSON.parse(response.body)

    case status
    when "captured"
      PaymentApiHelper.capture_payment(payment["payment_id"])
      payment["status"] = "captured"
    when "voided"
      PaymentApiHelper.void_payment(payment["payment_id"])
      payment["status"] = "voided"
    when "refunded"
      PaymentApiHelper.capture_payment(payment["payment_id"])
      PaymentApiHelper.refund_payment(payment["payment_id"], amount: amount)
      payment["status"] = "refunded"
    end

    payment
  end

  def self.create_multiple_payments(count, merchant_id: TestEnvironment.current_merchant_id)
    count.times.map do |i|
      response = PaymentApiHelper.create_payment(
        amount:      (10 + i).to_f,
        currency:    "USD",
        order_id:    "ORD-BATCH-#{i}-#{SecureRandom.hex(3)}",
        customer_id: merchant_id
      )
      JSON.parse(response.body)
    end
  end

  def self.create_payment_with_idempotency_key(idem_key, merchant_id:)
    response = PaymentApiHelper.create_payment(
      amount:          100.00,
      currency:        "USD",
      order_id:        "ORD-IDEM-#{SecureRandom.hex(4)}",
      customer_id:     merchant_id,
      idempotency_key: idem_key
    )
    JSON.parse(response.body)
  end

  def self.create_payment_with_id_and_key(payment_id, idem_key, merchant_id:)
    response = PaymentApiHelper.create_payment(
      amount:          100.00,
      currency:        "USD",
      order_id:        "ORD-IDEM-#{payment_id}",
      customer_id:     merchant_id,
      idempotency_key: idem_key,
      forced_id:       payment_id
    )
    JSON.parse(response.body)
  end
end

module DisputeTestHelper
  def self.open_dispute_for_payment(payment_id)
    response = DisputeApiHelper.create_dispute(
      payment_id: payment_id,
      reason:     "item_not_received"
    )
    JSON.parse(response.body)
  end

  def self.create_dispute_with_deadline(status:, days_remaining:, merchant_id:)
    payment = PaymentTestHelper.create_payment_with_status("captured", merchant_id: merchant_id)
    dispute = open_dispute_for_payment(payment["payment_id"])
    # In a real environment, the test API supports adjusting dispute deadlines via a test helper endpoint
    ApiClient.patch(
      "/test/disputes/#{dispute["dispute_id"]}/deadline",
      body: { days_from_now: days_remaining }
    )
    dispute.merge("status" => status)
  end

  def self.create_dispute(status:, merchant_id:)
    payment = PaymentTestHelper.create_payment_with_status("captured", merchant_id: merchant_id)
    dispute = open_dispute_for_payment(payment["payment_id"])
    dispute.merge("status" => status)
  end

  def self.create_multiple_disputes(count, status:, merchant_id:)
    count.times.map { create_dispute(status: status, merchant_id: merchant_id) }
  end
end

module AccountTestHelper
  def self.set_account_balance(merchant_id, amount)
    ApiClient.patch("/test/accounts/#{merchant_id}/balance", body: { balance: amount })
  end

  def self.set_account_status(merchant_id, status)
    ApiClient.patch("/test/accounts/#{merchant_id}/status", body: { status: status })
  end

  def self.create_test_account(account_id)
    ApiClient.post(PathConstants::ACCOUNTS_PATH, body: { merchant_id: account_id, status: "active" })
  end
end

module WebhookTestHelper
  def self.get_deliveries_for_webhook(webhook_id)
    response = ApiClient.get("/test/webhooks/#{webhook_id}/deliveries")
    JSON.parse(response.body)
  end
end

# ─── RSpec matchers (shared via Cucumber world) ───────────────────────────────

World(RSpec::Matchers) if defined?(RSpec::Matchers)
