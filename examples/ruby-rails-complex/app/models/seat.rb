# frozen_string_literal: true

class Seat < ApplicationRecord
  belongs_to :subscription
  belongs_to :user

  validates :subscription_id, presence: true
  validates :user_id, presence: true
  validates :role, presence: true
  validates :user_id, uniqueness: { scope: :subscription_id, message: "already has a seat in this subscription" }

  scope :active, -> { where(status: :active, deactivated_at: nil) }

  enum status: { pending: 0, active: 1, deactivated: 2 }

  def deactivate!
    update!(status: :deactivated, deactivated_at: Time.current)
  end
end
