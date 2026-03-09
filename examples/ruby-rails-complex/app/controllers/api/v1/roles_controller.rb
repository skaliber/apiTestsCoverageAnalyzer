# frozen_string_literal: true

module Api
  module V1
    class RolesController < ApplicationController
      before_action :authenticate_request!
      before_action :require_admin!

      # GET /api/v1/roles
      def index
        @roles = Role.all.order(:name)

        render json: {
          data: @roles.map { |r| role_json(r) }
        }
      end

      # GET /api/v1/roles/:id
      def show
        @role = Role.find(params[:id])
        render json: { data: role_json(@role) }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Role not found" }, status: :not_found
      end

      # POST /api/v1/roles
      def create
        @role = Role.new(role_params)

        if @role.save
          audit_log!(:role_created, @role)
          render json: { data: role_json(@role) }, status: :created
        else
          render json: { errors: @role.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PUT /api/v1/roles/:id
      def update
        @role = Role.find(params[:id])

        if @role.system_role?
          render json: { error: "Cannot modify system roles" }, status: :forbidden
          return
        end

        if @role.update(role_params)
          audit_log!(:role_updated, @role)
          render json: { data: role_json(@role) }
        else
          render json: { errors: @role.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Role not found" }, status: :not_found
      end

      # DELETE /api/v1/roles/:id
      def destroy
        @role = Role.find(params[:id])

        if @role.system_role?
          render json: { error: "Cannot delete system roles" }, status: :forbidden
          return
        end

        if @role.users.any?
          render json: { error: "Cannot delete role with active users" }, status: :unprocessable_entity
          return
        end

        @role.destroy
        audit_log!(:role_deleted, @role)
        render json: { message: "Role deleted successfully" }
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Role not found" }, status: :not_found
      end

      private

      def require_admin!
        return if current_user.admin?

        render json: { error: "Admin privileges required" }, status: :forbidden
      end

      def role_params
        params.require(:role).permit(:name, :description, permissions: [])
      end

      def role_json(role)
        {
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          system_role: role.system_role?,
          users_count: role.users.count,
          created_at: role.created_at.iso8601
        }
      end
    end
  end
end
