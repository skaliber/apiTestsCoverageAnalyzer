# frozen_string_literal: true

class ApplicationController < ActionController::API
  include ApiHelper
  include PathHelper

  before_action :authenticate_request!

  attr_reader :current_user

  private

  def authenticate_request!
    token = extract_token_from_header
    payload = JwtService.decode(token)
    @current_user = User.find(payload[:user_id])
  rescue JWT::DecodeError, ActiveRecord::RecordNotFound
    render json: { error: "Unauthorized" }, status: :unauthorized
  end

  def extract_token_from_header
    header = request.headers["Authorization"]
    header&.split(" ")&.last
  end

  def audit_log!(action, resource)
    AuditLog.create!(
      user: current_user,
      action: action,
      resource_type: resource.class.name,
      resource_id: resource.id,
      changes_data: resource.try(:previous_changes),
      ip_address: request.remote_ip,
      user_agent: request.user_agent
    )
  rescue StandardError => e
    Rails.logger.error("Failed to create audit log: #{e.message}")
  end

  def pagination_meta(collection)
    {
      current_page: collection.current_page,
      total_pages: collection.total_pages,
      total_count: collection.total_count,
      per_page: collection.limit_value
    }
  end
end
