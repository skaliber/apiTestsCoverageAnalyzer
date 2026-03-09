# frozen_string_literal: true

module Api
  module V1
    class SubscriptionsController < ApplicationController
      before_action :authenticate_request!
      before_action :set_subscription, only: [:show, :update, :destroy, :upgrade, :cancel]

      # POST /api/v1/subscriptions
      def create
        result = SubscriptionService.new(current_user).create(subscription_params)

        if result.success?
          audit_log!(:subscription_created, result.subscription)
          render json: { data: subscription_json(result.subscription) }, status: :created
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/subscriptions/:id
      def show
        authorize_subscription_access!
        render json: { data: subscription_json(@subscription) }
      end

      # PUT /api/v1/subscriptions/:id
      def update
        authorize_subscription_access!

        result = SubscriptionService.new(current_user).update(@subscription, subscription_params)

        if result.success?
          audit_log!(:subscription_updated, @subscription)
          render json: { data: subscription_json(result.subscription) }
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/subscriptions/:id
      # Business Rule: subscription-cancellation-period
      def destroy
        authorize_subscription_access!

        result = SubscriptionService.new(current_user).cancel(@subscription, immediate: true)

        if result.success?
          audit_log!(:subscription_deleted, @subscription)
          render json: { message: "Subscription cancelled immediately" }
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/subscriptions/:id/upgrade
      def upgrade
        authorize_subscription_access!

        plan = Plan.find(params[:plan_id])
        result = SubscriptionService.new(current_user).upgrade(@subscription, plan)

        if result.success?
          audit_log!(:subscription_upgraded, @subscription)
          render json: { data: subscription_json(result.subscription) }
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Plan not found" }, status: :not_found
      end

      # POST /api/v1/subscriptions/:id/cancel
      # Business Rule: subscription-cancellation-period
      def cancel
        authorize_subscription_access!

        result = SubscriptionService.new(current_user).cancel(@subscription, immediate: false)

        if result.success?
          audit_log!(:subscription_cancellation_scheduled, @subscription)
          render json: {
            data: subscription_json(result.subscription),
            message: "Subscription will be cancelled at period end: #{result.subscription.current_period_end.iso8601}"
          }
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      end

      private

      def set_subscription
        @subscription = Subscription.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Subscription not found" }, status: :not_found
      end

      def authorize_subscription_access!
        return if current_user.admin? || @subscription.user_id == current_user.id

        render json: { error: "Access denied" }, status: :forbidden
      end

      def subscription_params
        params.require(:subscription).permit(
          :plan_id, :coupon_code, :payment_method_id,
          :billing_cycle, :trial_end_date
        )
      end

      def subscription_json(subscription)
        {
          id: subscription.id,
          user_id: subscription.user_id,
          plan: {
            id: subscription.plan.id,
            name: subscription.plan.name,
            price: subscription.plan.price,
            billing_cycle: subscription.plan.billing_cycle
          },
          status: subscription.status,
          current_period_start: subscription.current_period_start&.iso8601,
          current_period_end: subscription.current_period_end&.iso8601,
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_end_date: subscription.trial_end_date&.iso8601,
          seats_used: subscription.seats.count,
          seats_limit: subscription.plan.seat_limit,
          created_at: subscription.created_at.iso8601,
          updated_at: subscription.updated_at.iso8601
        }
      end
    end
  end
end
