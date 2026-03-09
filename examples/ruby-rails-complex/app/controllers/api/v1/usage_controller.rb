# frozen_string_literal: true

module Api
  module V1
    class UsageController < ApplicationController
      before_action :authenticate_request!

      # GET /api/v1/usage/:subscription_id
      # Business Rule: active-subscription-required
      def show
        @subscription = Subscription.find(params[:subscription_id])

        unless @subscription.user_id == current_user.id || current_user.admin?
          render json: { error: "Access denied" }, status: :forbidden
          return
        end

        unless @subscription.active?
          render json: { error: "Active subscription required" }, status: :payment_required
          return
        end

        usage_summary = UsageService.new(@subscription).summary(
          period_start: params[:period_start],
          period_end: params[:period_end]
        )

        render json: { data: usage_summary }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Subscription not found" }, status: :not_found
      end

      # POST /api/v1/usage/record
      # Business Rule: usage-quota-enforcement
      def record
        @subscription = Subscription.find(params[:subscription_id])

        unless @subscription.active?
          render json: { error: "Active subscription required" }, status: :payment_required
          return
        end

        result = UsageService.new(@subscription).record(usage_params)

        if result.success?
          render json: { data: result.usage_record }, status: :created
        elsif result.quota_exceeded?
          render json: {
            error: "Usage quota exceeded",
            quota: result.quota,
            current_usage: result.current_usage
          }, status: :unprocessable_entity
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Subscription not found" }, status: :not_found
      end

      private

      def usage_params
        params.require(:usage).permit(
          :metric, :quantity, :timestamp, :metadata
        )
      end
    end
  end
end
