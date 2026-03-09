# frozen_string_literal: true

module Api
  module V1
    class AuditLogsController < ApplicationController
      before_action :authenticate_request!
      before_action :require_admin_or_self!

      # GET /api/v1/audit-logs
      def index
        @logs = AuditLog.includes(:user)
                        .order(created_at: :desc)
                        .page(params[:page])
                        .per(params[:per_page] || 50)

        @logs = apply_filters(@logs)

        render json: {
          data: @logs.map { |log| audit_log_json(log) },
          meta: pagination_meta(@logs)
        }
      end

      private

      def require_admin_or_self!
        return if current_user.admin?
        return if params[:user_id].present? && params[:user_id].to_s == current_user.id.to_s

        render json: { error: "Access denied" }, status: :forbidden
      end

      def apply_filters(scope)
        scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?
        scope = scope.where(action: params[:action]) if params[:action].present?
        scope = scope.where(resource_type: params[:resource_type]) if params[:resource_type].present?
        scope = scope.where("created_at >= ?", params[:from]) if params[:from].present?
        scope = scope.where("created_at <= ?", params[:to]) if params[:to].present?
        scope
      end

      def audit_log_json(log)
        {
          id: log.id,
          user_id: log.user_id,
          user_email: log.user&.email,
          action: log.action,
          resource_type: log.resource_type,
          resource_id: log.resource_id,
          changes: log.changes_data,
          ip_address: log.ip_address,
          user_agent: log.user_agent,
          created_at: log.created_at.iso8601
        }
      end
    end
  end
end
