# frozen_string_literal: true

class Invoice < ApplicationRecord
  belongs_to :subscription
  belongs_to :user

  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :currency, presence: true
  validates :status, presence: true
  validates :due_date, presence: true

  scope :paid, -> { where(status: :paid) }
  scope :unpaid, -> { where(status: [:pending, :past_due]) }
  scope :overdue, -> { where(status: :past_due).or(where("due_date < ? AND status = ?", Time.current, statuses[:pending])) }

  enum status: { pending: 0, paid: 1, past_due: 2, void: 3, refunded: 4 }

  # Business Rule: invoice-payment-window (30 days)
  PAYMENT_WINDOW_DAYS = 30

  def overdue?
    !paid? && due_date < Time.current
  end

  def paid?
    status == "paid"
  end

  def days_overdue
    return 0 unless overdue?

    (Time.current.to_date - due_date.to_date).to_i
  end

  def mark_paid!(paid_at: Time.current)
    update!(status: :paid, paid_at: paid_at)
  end

  def self.current_mrr
    active_subscriptions = Subscription.active
    active_subscriptions.joins(:plan).sum("plans.price")
  end
end
