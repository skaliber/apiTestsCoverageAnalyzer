# frozen_string_literal: true

module Api
  module V1
    class SeatsController < ApplicationController
      before_action :authenticate_request!
      before_action :set_subscription

      # GET /api/v1/seats
      def index
        authorize_subscription_access!

        @seats = @subscription.seats.includes(:user).active

        render json: {
          data: @seats.map { |s| seat_json(s) },
          meta: {
            seats_used: @seats.count,
            seats_limit: @subscription.plan.seat_limit,
            seats_available: @subscription.plan.seat_limit - @seats.count
          }
        }
      end

      # POST /api/v1/seats
      # Business Rule: seat-limit-per-plan
      def create
        authorize_subscription_access!

        if @subscription.seats_at_limit?
          render json: {
            error: "Seat limit reached",
            seats_used: @subscription.seats.count,
            seats_limit: @subscription.plan.seat_limit,
            upgrade_url: "/api/v1/subscriptions/#{@subscription.id}/upgrade"
          }, status: :unprocessable_entity
          return
        end

        invited_user = User.find_by(email: seat_params[:email])

        if invited_user.nil?
          render json: { error: "User not found with that email" }, status: :not_found
          return
        end

        @seat = @subscription.seats.new(user: invited_user, role: seat_params[:role] || "member")

        if @seat.save
          audit_log!(:seat_added, @seat)
          render json: { data: seat_json(@seat) }, status: :created
        else
          render json: { errors: @seat.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/seats/:id
      def destroy
        authorize_subscription_access!

        @seat = @subscription.seats.find(params[:id])

        if @seat.user_id == current_user.id && !current_user.admin?
          render json: { error: "Cannot remove your own seat" }, status: :forbidden
          return
        end

        @seat.deactivate!
        audit_log!(:seat_removed, @seat)
        render json: { message: "Seat removed successfully" }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Seat not found" }, status: :not_found
      end

      private

      def set_subscription
        @subscription = Subscription.find(params[:subscription_id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Subscription not found" }, status: :not_found
      end

      def authorize_subscription_access!
        return if current_user.admin? || @subscription.user_id == current_user.id

        render json: { error: "Access denied" }, status: :forbidden
      end

      def seat_params
        params.require(:seat).permit(:email, :role)
      end

      def seat_json(seat)
        {
          id: seat.id,
          user: {
            id: seat.user.id,
            email: seat.user.email,
            name: "#{seat.user.first_name} #{seat.user.last_name}".strip
          },
          role: seat.role,
          status: seat.status,
          invited_at: seat.created_at.iso8601,
          activated_at: seat.activated_at&.iso8601
        }
      end
    end
  end
end
