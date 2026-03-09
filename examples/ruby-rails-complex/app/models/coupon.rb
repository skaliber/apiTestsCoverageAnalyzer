# frozen_string_literal: true

class Coupon < ApplicationRecord
  has_many :redemptions, class_name: "CouponRedemption"

  validates :code, presence: true, uniqueness: { case_sensitive: false }
  validates :discount_type, presence: true, inclusion: { in: %w[percentage fixed] }
  validates :discount_value, presence: true, numericality: { greater_than: 0 }

  # Business Rule: coupon-single-use
  def active?
    active == true && (expires_at.nil? || expires_at > Time.current)
  end

  def single_use?
    max_redemptions_per_user == 1
  end

  def applicable_plan_ids
    plan_ids.present? ? plan_ids : Plan.active.pluck(:id)
  end

  def discount_amount_for(price)
    if discount_type == "percentage"
      (price * discount_value / 100.0).round(2)
    else
      [discount_value, price].min
    end
  end
end
