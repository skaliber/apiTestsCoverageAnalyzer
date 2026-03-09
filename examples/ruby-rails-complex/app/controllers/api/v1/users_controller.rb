# frozen_string_literal: true

module Api
  module V1
    class UsersController < ApplicationController
      before_action :authenticate_request!
      before_action :set_user, only: [:show, :update, :destroy]
      before_action :require_admin!, only: [:destroy]

      # GET /api/v1/users
      def index
        @users = User.active.page(params[:page]).per(params[:per_page] || 25)

        render json: {
          data: @users.map { |u| user_json(u) },
          meta: pagination_meta(@users)
        }
      end

      # POST /api/v1/users
      def create
        @user = User.new(user_params)

        if @user.save
          audit_log!(:user_created, @user)
          render json: { data: user_json(@user) }, status: :created
        else
          render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/users/:id
      def show
        render json: { data: user_json(@user) }
      end

      # PUT /api/v1/users/:id
      def update
        if @user.update(user_params)
          audit_log!(:user_updated, @user)
          render json: { data: user_json(@user) }
        else
          render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/users/:id
      # Business Rule: user-deletion-requires-admin
      def destroy
        if @user == current_user
          render json: { error: "Cannot delete your own account" }, status: :forbidden
          return
        end

        @user.soft_delete!
        audit_log!(:user_deleted, @user)
        render json: { message: "User deleted successfully" }, status: :ok
      end

      private

      def set_user
        @user = User.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "User not found" }, status: :not_found
      end

      def user_params
        params.require(:user).permit(
          :email, :password, :first_name, :last_name,
          :company_name, :phone, :timezone, :role_id
        )
      end

      def require_admin!
        return if current_user.admin?

        render json: { error: "Admin privileges required" }, status: :forbidden
      end

      def user_json(user)
        {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          company_name: user.company_name,
          phone: user.phone,
          timezone: user.timezone,
          role: user.role&.name,
          active: user.active?,
          created_at: user.created_at.iso8601,
          updated_at: user.updated_at.iso8601
        }
      end
    end
  end
end
