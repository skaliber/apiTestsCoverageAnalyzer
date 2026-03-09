# frozen_string_literal: true

class AuditLog < ApplicationRecord
  belongs_to :user, optional: true

  validates :action, presence: true
  validates :resource_type, presence: true

  scope :recent, -> { order(created_at: :desc) }
  scope :for_resource, ->(type, id) { where(resource_type: type, resource_id: id) }

  def self.log(action:, resource:, user:, request: nil, changes: nil)
    create!(
      action: action,
      resource_type: resource.class.name,
      resource_id: resource.id,
      user: user,
      changes_data: changes || resource.try(:previous_changes),
      ip_address: request&.remote_ip,
      user_agent: request&.user_agent
    )
  end
end
