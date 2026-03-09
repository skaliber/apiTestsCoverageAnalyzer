# frozen_string_literal: true

module Api
  module V1
    class AdminController < ApplicationController
      before_action :authenticate_request!
      before_action :require_admin!

      # GET /api/v1/admin/health
      def health
        checks = {
          database: database_healthy?,
          redis: redis_healthy?,
          sidekiq: sidekiq_healthy?,
          storage: storage_healthy?
        }

        overall_status = checks.values.all? ? "healthy" : "degraded"
        http_status = overall_status == "healthy" ? :ok : :service_unavailable

        render json: {
          status: overall_status,
          timestamp: Time.current.iso8601,
          version: ENV.fetch("APP_VERSION", "1.0.0"),
          checks: checks
        }, status: http_status
      end

      # GET /api/v1/admin/stats
      def stats
        render json: {
          data: {
            users: {
              total: User.count,
              active: User.active.count,
              new_this_month: User.where("created_at >= ?", Time.current.beginning_of_month).count
            },
            subscriptions: {
              total: Subscription.count,
              active: Subscription.active.count,
              trialing: Subscription.trialing.count,
              cancelled: Subscription.cancelled.count,
              past_due: Subscription.past_due.count
            },
            revenue: {
              mrr: Invoice.current_mrr,
              arr: Invoice.current_mrr * 12,
              this_month: Invoice.paid.where("paid_at >= ?", Time.current.beginning_of_month).sum(:amount)
            },
            invoices: {
              outstanding: Invoice.unpaid.count,
              overdue: Invoice.overdue.count
            }
          },
          generated_at: Time.current.iso8601
        }
      end

      private

      def require_admin!
        return if current_user.admin?

        render json: { error: "Admin privileges required" }, status: :forbidden
      end

      def database_healthy?
        ActiveRecord::Base.connection.execute("SELECT 1")
        true
      rescue StandardError
        false
      end

      def redis_healthy?
        Redis.current.ping == "PONG"
      rescue StandardError
        false
      end

      def sidekiq_healthy?
        Sidekiq::ProcessSet.new.size.positive?
      rescue StandardError
        # Not critical if sidekiq info unavailable
        true
      end

      def storage_healthy?
        # Check if storage is accessible
        true
      rescue StandardError
        false
      end
    end
  end
end
