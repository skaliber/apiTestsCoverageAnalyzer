# frozen_string_literal: true

module Api
  module V1
    class CouponsController < ApplicationController
      before_action :authenticate_request!

      # POST /api/v1/coupons/validate
      # Business Rule: coupon-single-use
      def validate
        coupon = Coupon.find_by(code: params[:code])

        if coupon.nil?
          render json: { error: "Coupon not found" }, status: :not_found
          return
        end

        unless coupon.active?
          render json: { error: "Coupon is expired or inactive", code: params[:code] },
                 status: :unprocessable_entity
          return
        end

        if coupon.single_use? && coupon.redemptions.where(user_id: current_user.id).exists?
          render json: {
            error: "Coupon has already been used by this account",
            code: params[:code]
          }, status: :unprocessable_entity
          return
        end

        if coupon.max_redemptions && coupon.redemptions.count >= coupon.max_redemptions
          render json: { error: "Coupon redemption limit reached" }, status: :unprocessable_entity
          return
        end

        render json: {
          data: {
            code: coupon.code,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            applicable_plans: coupon.applicable_plan_ids,
            expires_at: coupon.expires_at&.iso8601,
            valid: true
          }
        }
      end
    end
  end
end
