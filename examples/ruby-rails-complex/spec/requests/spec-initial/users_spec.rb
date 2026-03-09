# frozen_string_literal: true

require "rails_helper"

# PARTIAL COVERAGE SPEC - spec-initial
# This file covers approximately 50% of user endpoints.
# Missing: error scenarios, auth failures, admin-only restrictions,
# pagination, and the DELETE endpoint business rule validation.

module ApiHelpers
  USERS_PATH        = "/api/v1/users"
  SUBSCRIPTIONS_PATH = "/api/v1/subscriptions"

  def create_user(attrs = {})
    post USERS_PATH, params: default_user_attrs.merge(attrs), headers: auth_headers
  end

  def default_user_attrs
    {
      user: {
        email: "user#{rand(10_000)}@example.com",
        password: "SecurePass123!",
        first_name: "Test",
        last_name: "User"
      }
    }
  end
end

RSpec.describe "Users API", type: :request do
  include ApiHelpers

  let(:admin_user) { create(:user, :admin) }
  let(:regular_user) { create(:user) }
  let(:auth_headers) { auth_headers_for(regular_user) }
  let(:admin_headers) { auth_headers_for(admin_user) }

  describe "POST /api/v1/users" do
    it "creates a user with valid params" do
      post "/api/v1/users",
           params: {
             user: {
               email: "newuser@example.com",
               password: "SecurePass123!",
               first_name: "Jane",
               last_name: "Doe"
             }
           },
           headers: admin_headers

      expect(response).to have_http_status(:created)
      json = JSON.parse(response.body)
      expect(json["data"]["email"]).to eq("newuser@example.com")
      expect(json["data"]["first_name"]).to eq("Jane")
    end

    it "returns 422 when email is missing" do
      post "/api/v1/users",
           params: {
             user: {
               password: "SecurePass123!",
               first_name: "Jane",
               last_name: "Doe"
             }
           },
           headers: admin_headers

      expect(response).to have_http_status(:unprocessable_entity)
      json = JSON.parse(response.body)
      expect(json["errors"]).to include(match(/email/i))
    end

    it "returns 422 when email is a duplicate" do
      create(:user, email: "existing@example.com")

      post "/api/v1/users",
           params: {
             user: {
               email: "existing@example.com",
               password: "SecurePass123!",
               first_name: "Jane",
               last_name: "Doe"
             }
           },
           headers: admin_headers

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "GET /api/v1/users" do
    before { create_list(:user, 5) }

    it "returns a list of users" do
      get "/api/v1/users", headers: admin_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]).to be_an(Array)
      expect(json["data"].length).to be_positive
    end

    it "includes pagination metadata" do
      get "/api/v1/users", headers: admin_headers

      json = JSON.parse(response.body)
      expect(json["meta"]).to include("current_page", "total_pages", "total_count")
    end

    # NOTE: Missing test - per_page parameter behavior
    # NOTE: Missing test - only returns active users (not soft-deleted)
  end

  describe "GET /api/v1/users/:id" do
    it "returns the user" do
      get "/api/v1/users/#{regular_user.id}", headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]["id"]).to eq(regular_user.id)
      expect(json["data"]["email"]).to eq(regular_user.email)
    end

    it "returns 404 for non-existent user" do
      get "/api/v1/users/99999999", headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end

    # NOTE: Missing test - 401 when not authenticated
  end

  describe "PUT /api/v1/users/:id" do
    it "updates the user's profile" do
      put "/api/v1/users/#{regular_user.id}",
          params: { user: { first_name: "Updated", company_name: "Acme Corp" } },
          headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]["first_name"]).to eq("Updated")
      expect(json["data"]["company_name"]).to eq("Acme Corp")
    end

    # NOTE: Missing test - 422 with invalid data
    # NOTE: Missing test - 404 when user not found
    # NOTE: Missing test - 401 when not authenticated
  end

  # NOTE: DELETE endpoint is NOT tested in spec-initial
  # Business Rule: user-deletion-requires-admin - completely uncovered
end
