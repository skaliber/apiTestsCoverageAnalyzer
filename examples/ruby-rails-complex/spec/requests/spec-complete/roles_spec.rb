# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Roles
# Covers: index, show, create, update, destroy (admin-only)

RSpec.describe "Roles API - Complete Coverage", type: :request do
  let(:admin_user) { create(:user, :admin) }
  let(:regular_user) { create(:user) }

  let(:admin_headers) { auth_headers_for(admin_user) }
  let(:user_headers) { auth_headers_for(regular_user) }

  describe "GET /api/v1/roles" do
    before { create_list(:role, 3, :custom) }

    it "returns all roles for admin" do
      get "/api/v1/roles", headers: admin_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]).to be_an(Array)
    end

    it "returns 403 for non-admin" do
      get "/api/v1/roles", headers: user_headers

      expect(response).to have_http_status(:forbidden)
    end

    it "returns 401 without token" do
      get "/api/v1/roles"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/v1/roles/:id" do
    let(:role) { create(:role, :custom, name: "developer") }

    it "returns the role for admin" do
      get "/api/v1/roles/#{role.id}", headers: admin_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]["name"]).to eq("developer")
    end

    it "returns 404 for non-existent role" do
      get "/api/v1/roles/99999", headers: admin_headers

      expect(response).to have_http_status(:not_found)
    end

    it "returns 403 for non-admin" do
      get "/api/v1/roles/#{role.id}", headers: user_headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /api/v1/roles" do
    let(:valid_params) do
      { role: { name: "developer", description: "Developer access", permissions: ["read", "write"] } }
    end

    it "creates a role" do
      post "/api/v1/roles", params: valid_params, headers: admin_headers

      expect(response).to have_http_status(:created)
      json = JSON.parse(response.body)
      expect(json["data"]["name"]).to eq("developer")
    end

    it "returns 422 with duplicate name" do
      create(:role, name: "developer")
      post "/api/v1/roles", params: valid_params, headers: admin_headers

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 403 for non-admin" do
      post "/api/v1/roles", params: valid_params, headers: user_headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PUT /api/v1/roles/:id" do
    let(:custom_role) { create(:role, :custom, name: "analyst") }

    it "updates a custom role" do
      put "/api/v1/roles/#{custom_role.id}",
          params: { role: { description: "Updated description" } },
          headers: admin_headers

      expect(response).to have_http_status(:ok)
    end

    it "returns 403 when trying to modify system roles" do
      system_role = create(:role, name: "admin")

      put "/api/v1/roles/#{system_role.id}",
          params: { role: { description: "Hacked" } },
          headers: admin_headers

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body)["error"]).to match(/system roles/i)
    end

    it "returns 404 for non-existent role" do
      put "/api/v1/roles/99999",
          params: { role: { description: "Test" } },
          headers: admin_headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /api/v1/roles/:id" do
    let(:custom_role) { create(:role, :custom) }

    it "deletes a custom role with no users" do
      delete "/api/v1/roles/#{custom_role.id}", headers: admin_headers

      expect(response).to have_http_status(:ok)
    end

    it "returns 403 when trying to delete system role" do
      system_role = create(:role, name: "member")

      delete "/api/v1/roles/#{system_role.id}", headers: admin_headers

      expect(response).to have_http_status(:forbidden)
    end

    it "returns 422 when role has active users" do
      create(:user, role: custom_role)

      delete "/api/v1/roles/#{custom_role.id}", headers: admin_headers

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 403 for non-admin" do
      delete "/api/v1/roles/#{custom_role.id}", headers: user_headers

      expect(response).to have_http_status(:forbidden)
    end
  end
end
