# frozen_string_literal: true

class Plan < ApplicationRecord
  has_many :subscriptions

  validates :name, presence: true, uniqueness: { case_sensitive: false }
  validates :price, presence: true, numericality: { greater_than_or_equal_to: 0 }
  validates :billing_cycle, presence: true, inclusion: { in: %w[monthly yearly] }
  validates :seat_limit, numericality: { greater_than: 0 }, allow_nil: true
  validates :usage_quota, numericality: { greater_than: 0 }, allow_nil: true

  scope :active, -> { where(active: true) }

  def popular?
    name.downcase == "professional" || popular == true
  end

  def active?
    active == true
  end

  def monthly_equivalent_price
    return price if billing_cycle == "monthly"

    price / 12.0
  end

  def upgrade_from?(other_plan)
    price > other_plan.price
  end

  def downgrade_from?(other_plan)
    price < other_plan.price
  end
end
