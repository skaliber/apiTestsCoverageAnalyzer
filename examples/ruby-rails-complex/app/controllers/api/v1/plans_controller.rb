# frozen_string_literal: true

module Api
  module V1
    class PlansController < ApplicationController
      before_action :authenticate_request!

      # GET /api/v1/plans
      def index
        @plans = Plan.active.order(:price)

        render json: {
          data: @plans.map { |p| plan_json(p) }
        }
      end

      # GET /api/v1/plans/:id
      def show
        @plan = Plan.find(params[:id])
        render json: { data: plan_json(@plan) }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Plan not found" }, status: :not_found
      end

      private

      def plan_json(plan)
        {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          currency: plan.currency,
          billing_cycle: plan.billing_cycle,
          seat_limit: plan.seat_limit,
          usage_quota: plan.usage_quota,
          features: plan.features,
          popular: plan.popular?,
          active: plan.active?,
          created_at: plan.created_at.iso8601
        }
      end
    end
  end
end
