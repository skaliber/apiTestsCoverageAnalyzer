# frozen_string_literal: true

module ApiSpecHelpers
  include PathHelper

  USERS_PATH              = "/api/v1/users"
  SUBSCRIPTIONS_PATH      = "/api/v1/subscriptions"
  INVOICES_PATH           = "/api/v1/invoices"
  USAGE_RECORD_PATH       = "/api/v1/usage/record"
  PLANS_PATH              = "/api/v1/plans"
  COUPONS_VALIDATE_PATH   = "/api/v1/coupons/validate"
  AUDIT_LOGS_PATH         = "/api/v1/audit-logs"
  WEBHOOKS_PATH           = "/api/v1/webhooks"
  ADMIN_HEALTH_PATH       = "/api/v1/admin/health"
  ADMIN_STATS_PATH        = "/api/v1/admin/stats"

  def usage_path(subscription_id)
    "/api/v1/usage/#{subscription_id}"
  end

  def seats_path(subscription_id)
    "/api/v1/subscriptions/#{subscription_id}/seats"
  end

  def seat_path(subscription_id, seat_id)
    "/api/v1/subscriptions/#{subscription_id}/seats/#{seat_id}"
  end

  def subscription_path(id)
    "/api/v1/subscriptions/#{id}"
  end

  def subscription_upgrade_path(id)
    "/api/v1/subscriptions/#{id}/upgrade"
  end

  def subscription_cancel_path(id)
    "/api/v1/subscriptions/#{id}/cancel"
  end

  def invoice_path(id)
    "/api/v1/invoices/#{id}"
  end

  def invoice_pay_path(id)
    "/api/v1/invoices/#{id}/pay"
  end

  def plan_path(id)
    "/api/v1/plans/#{id}"
  end

  def json_response
    JSON.parse(response.body)
  end

  def json_data
    json_response["data"]
  end

  def json_errors
    json_response["errors"]
  end

  def json_error
    json_response["error"]
  end

  def default_user_params(overrides = {})
    {
      user: {
        email: "user#{SecureRandom.hex(4)}@example.com",
        password: "SecurePass123!",
        first_name: "Test",
        last_name: "User",
        **overrides
      }
    }
  end

  def post_to_users(params, headers)
    post USERS_PATH, params: params, headers: headers
  end

  def create_subscription(plan, user, headers, coupon_code: nil)
    payload = { subscription: { plan_id: plan.id, billing_cycle: "monthly" } }
    payload[:subscription][:coupon_code] = coupon_code if coupon_code
    post SUBSCRIPTIONS_PATH, params: payload, headers: headers
  end
end

module AuthHelpers
  def generate_jwt_for(user)
    # Simplified JWT generation for tests
    JWT.encode(
      { user_id: user.id, exp: 24.hours.from_now.to_i },
      Rails.application.secret_key_base,
      "HS256"
    )
  end

  def auth_headers_for(user)
    token = generate_jwt_for(user)
    {
      "Authorization" => "Bearer #{token}",
      "Content-Type" => "application/json",
      "Accept" => "application/json"
    }
  end

  def webhook_headers(payload_body)
    secret = ENV.fetch("WEBHOOK_SECRET", "test_webhook_secret")
    signature = "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, payload_body.to_json)
    { "X-Webhook-Signature" => signature, "Content-Type" => "application/json" }
  end
end
