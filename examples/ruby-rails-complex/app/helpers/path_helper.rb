# frozen_string_literal: true

module PathHelper
  # Base API path
  API_V1_BASE = "/api/v1"

  # User paths
  USERS_PATH        = "#{API_V1_BASE}/users"
  USER_PATH         = "#{API_V1_BASE}/users/:id"

  # Subscription paths
  SUBSCRIPTIONS_PATH       = "#{API_V1_BASE}/subscriptions"
  SUBSCRIPTION_PATH        = "#{API_V1_BASE}/subscriptions/:id"
  SUBSCRIPTION_UPGRADE_PATH = "#{API_V1_BASE}/subscriptions/:id/upgrade"
  SUBSCRIPTION_CANCEL_PATH  = "#{API_V1_BASE}/subscriptions/:id/cancel"

  # Invoice paths
  INVOICES_PATH    = "#{API_V1_BASE}/invoices"
  INVOICE_PATH     = "#{API_V1_BASE}/invoices/:id"
  INVOICE_PAY_PATH = "#{API_V1_BASE}/invoices/:id/pay"

  # Usage paths
  USAGE_PATH        = "#{API_V1_BASE}/usage/:subscription_id"
  USAGE_RECORD_PATH = "#{API_V1_BASE}/usage/record"

  # Seat paths (nested under subscriptions)
  SEATS_PATH = "#{API_V1_BASE}/subscriptions/:subscription_id/seats"
  SEAT_PATH  = "#{API_V1_BASE}/subscriptions/:subscription_id/seats/:id"

  # Role paths
  ROLES_PATH = "#{API_V1_BASE}/roles"
  ROLE_PATH  = "#{API_V1_BASE}/roles/:id"

  # Plan paths
  PLANS_PATH = "#{API_V1_BASE}/plans"
  PLAN_PATH  = "#{API_V1_BASE}/plans/:id"

  # Coupon paths
  COUPONS_VALIDATE_PATH = "#{API_V1_BASE}/coupons/validate"

  # Audit log paths
  AUDIT_LOGS_PATH = "#{API_V1_BASE}/audit-logs"

  # Webhook paths
  WEBHOOKS_PATH = "#{API_V1_BASE}/webhooks"

  # Admin paths
  ADMIN_HEALTH_PATH = "#{API_V1_BASE}/admin/health"
  ADMIN_STATS_PATH  = "#{API_V1_BASE}/admin/stats"

  def users_path
    USERS_PATH
  end

  def user_path(id)
    USERS_PATH + "/#{id}"
  end

  def subscriptions_path
    SUBSCRIPTIONS_PATH
  end

  def subscription_path(id)
    SUBSCRIPTION_PATH.gsub(":id", id.to_s)
  end

  def subscription_upgrade_path(id)
    SUBSCRIPTION_UPGRADE_PATH.gsub(":id", id.to_s)
  end

  def subscription_cancel_path(id)
    SUBSCRIPTION_CANCEL_PATH.gsub(":id", id.to_s)
  end

  def invoices_path
    INVOICES_PATH
  end

  def invoice_path(id)
    INVOICE_PATH.gsub(":id", id.to_s)
  end

  def invoice_pay_path(id)
    INVOICE_PAY_PATH.gsub(":id", id.to_s)
  end

  def usage_path(subscription_id)
    USAGE_PATH.gsub(":subscription_id", subscription_id.to_s)
  end

  def usage_record_path
    USAGE_RECORD_PATH
  end

  def seats_path(subscription_id)
    SEATS_PATH.gsub(":subscription_id", subscription_id.to_s)
  end

  def seat_path(subscription_id, id)
    SEAT_PATH.gsub(":subscription_id", subscription_id.to_s).gsub(":id", id.to_s)
  end

  def plans_path
    PLANS_PATH
  end

  def plan_path(id)
    PLAN_PATH.gsub(":id", id.to_s)
  end

  def coupons_validate_path
    COUPONS_VALIDATE_PATH
  end

  def audit_logs_path
    AUDIT_LOGS_PATH
  end

  def webhooks_path
    WEBHOOKS_PATH
  end

  def admin_health_path
    ADMIN_HEALTH_PATH
  end

  def admin_stats_path
    ADMIN_STATS_PATH
  end
end
