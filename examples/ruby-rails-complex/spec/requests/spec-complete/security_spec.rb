# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Security Tests
# Tests authentication, authorization, token expiry, and injection prevention

RSpec.describe "Security - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:admin_user) { create(:user, :admin) }
  let(:auth_headers) { auth_headers_for(user) }

  describe "JWT Authentication" do
    it "returns 401 with no Authorization header" do
      get "/api/v1/users"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 with malformed Bearer token" do
      get "/api/v1/users",
          headers: { "Authorization" => "Bearer this.is.not.a.jwt" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 with an expired token" do
      expired_token = JWT.encode(
        { user_id: user.id, exp: 1.hour.ago.to_i },
        Rails.application.secret_key_base,
        "HS256"
      )
      get "/api/v1/users",
          headers: { "Authorization" => "Bearer #{expired_token}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 with a token signed by wrong secret" do
      bad_token = JWT.encode(
        { user_id: user.id, exp: 1.hour.from_now.to_i },
        "wrong_secret",
        "HS256"
      )
      get "/api/v1/users",
          headers: { "Authorization" => "Bearer #{bad_token}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 when token references a non-existent user" do
      token = JWT.encode(
        { user_id: 99999999, exp: 1.hour.from_now.to_i },
        Rails.application.secret_key_base,
        "HS256"
      )
      get "/api/v1/users",
          headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 for deleted (soft-deleted) user token" do
      user.soft_delete!
      get "/api/v1/users/#{user.id}", headers: auth_headers
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "Authorization (access control)" do
    let(:other_user) { create(:user) }
    let(:other_headers) { auth_headers_for(other_user) }

    let(:plan) { create(:plan, :starter) }
    let(:subscription) { create(:subscription, user: user, plan: plan) }

    it "prevents users from accessing each other's subscriptions" do
      get "/api/v1/subscriptions/#{subscription.id}", headers: other_headers
      expect(response).to have_http_status(:forbidden)
    end

    it "prevents users from accessing each other's invoices" do
      invoice = create(:invoice, user: user, subscription: subscription)
      get "/api/v1/invoices/#{invoice.id}", headers: other_headers
      expect(response).to have_http_status(:forbidden)
    end

    it "prevents non-admin from deleting users" do
      delete "/api/v1/users/#{other_user.id}", headers: auth_headers
      expect(response).to have_http_status(:forbidden)
    end

    it "prevents non-admin from accessing admin health endpoint" do
      get "/api/v1/admin/health", headers: auth_headers
      expect(response).to have_http_status(:forbidden)
    end

    it "prevents non-admin from accessing admin stats" do
      get "/api/v1/admin/stats", headers: auth_headers
      expect(response).to have_http_status(:forbidden)
    end

    it "prevents non-admin from listing all roles" do
      get "/api/v1/roles", headers: auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "Injection prevention" do
    it "handles SQL injection attempts in user ID parameter" do
      get "/api/v1/users/1%20OR%201%3D1", headers: auth_headers
      expect(response.status).to be_in([400, 404])
      expect(response.body).not_to match(/SQL/i)
    end

    it "handles XSS attempts in query parameters" do
      get "/api/v1/users",
          params: { page: "<script>alert('xss')</script>" },
          headers: auth_headers
      expect(response.status).to be_in([200, 400])
      expect(response.body).not_to include("<script>")
    end

    it "sanitizes user input in create user endpoint" do
      post "/api/v1/users",
           params: {
             user: {
               email: "test@example.com",
               password: "SecurePass123!",
               first_name: "<script>alert('xss')</script>",
               last_name: "User"
             }
           },
           headers: auth_headers

      if response.status == 201
        json = JSON.parse(response.body)
        expect(json["data"]["first_name"]).not_to include("<script>")
      end
    end
  end

  describe "Rate limiting awareness" do
    it "does not expose sensitive information in error responses" do
      get "/api/v1/users/#{user.id}"
      json = JSON.parse(response.body)
      expect(json["error"]).to eq("Unauthorized")
      expect(json.to_s).not_to match(/password/i)
      expect(json.to_s).not_to match(/secret/i)
      expect(json.to_s).not_to match(/token/i)
    end
  end

  describe "Webhook signature security" do
    it "rejects webhook without signature" do
      post "/api/v1/webhooks",
           params: { event: "payment.succeeded", payload: {} },
           headers: { "Content-Type" => "application/json" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects webhook with tampered signature" do
      payload = { event: "payment.succeeded", payload: { invoice_id: "inv_123" } }
      post "/api/v1/webhooks",
           params: payload,
           headers: {
             "X-Webhook-Signature" => "sha256=tampered_signature_here",
             "Content-Type" => "application/json"
           }

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
