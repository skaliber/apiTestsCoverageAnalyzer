# frozen_string_literal: true

class Subscription < ApplicationRecord
  belongs_to :user
  belongs_to :plan
  belongs_to :coupon, optional: true
  has_many :invoices
  has_many :seats
  has_many :usage_records

  validates :user_id, presence: true
  validates :plan_id, presence: true
  validates :status, presence: true

  scope :active, -> { where(status: :active) }
  scope :trialing, -> { where(status: :trialing) }
  scope :cancelled, -> { where(status: :cancelled) }
  scope :past_due, -> { where(status: :past_due) }

  enum status: {
    trialing: 0,
    active: 1,
    past_due: 2,
    cancelled: 3,
    expired: 4
  }

  def active?
    status.in?(["active", "trialing"])
  end

  def seats_at_limit?
    seats.active.count >= plan.seat_limit
  end

  def cancel!(immediate: false)
    if immediate
      update!(
        status: :cancelled,
        cancelled_at: Time.current,
        cancel_at_period_end: false
      )
    else
      update!(
        cancel_at_period_end: true,
        cancellation_scheduled_at: Time.current
      )
    end
  end

  def renew!(period_start:, period_end:)
    update!(
      status: :active,
      current_period_start: period_start,
      current_period_end: period_end,
      cancel_at_period_end: false
    )
  end

  def expire!
    update!(status: :expired, expired_at: Time.current)
  end

  def mark_past_due!
    update!(status: :past_due)
  end
end
