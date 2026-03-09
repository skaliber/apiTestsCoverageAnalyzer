# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Admin
# Covers: health check, stats - admin-only access

RSpec.describe "Admin API - Complete Coverage", type: :request do
  let(:admin_user) { create(:user, :admin) }
  let(:regular_user) { create(:user) }

  let(:admin_headers) { auth_headers_for(admin_user) }
  let(:user_headers) { auth_headers_for(regular_user) }

  describe "GET /api/v1/admin/health" do
    context "as an admin" do
      it "returns health status" do
        get "/api/v1/admin/health", headers: admin_headers

        expect(response.status).to be_in([200, 503])
        json = JSON.parse(response.body)
        expect(json["status"]).to be_in(["healthy", "degraded"])
        expect(json["timestamp"]).to be_present
        expect(json["version"]).to be_present
        expect(json["checks"]).to be_a(Hash)
      end

      it "returns 200 when all services are healthy" do
        allow_any_instance_of(Api::V1::AdminController).to receive(:database_healthy?).and_return(true)
        allow_any_instance_of(Api::V1::AdminController).to receive(:redis_healthy?).and_return(true)
        allow_any_instance_of(Api::V1::AdminController).to receive(:sidekiq_healthy?).and_return(true)
        allow_any_instance_of(Api::V1::AdminController).to receive(:storage_healthy?).and_return(true)

        get "/api/v1/admin/health", headers: admin_headers

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["status"]).to eq("healthy")
      end

      it "returns 503 when a service is degraded" do
        allow_any_instance_of(Api::V1::AdminController).to receive(:database_healthy?).and_return(true)
        allow_any_instance_of(Api::V1::AdminController).to receive(:redis_healthy?).and_return(false)

        get "/api/v1/admin/health", headers: admin_headers

        expect(response).to have_http_status(:service_unavailable)
        expect(JSON.parse(response.body)["status"]).to eq("degraded")
      end
    end

    context "as a non-admin" do
      it "returns 403" do
        get "/api/v1/admin/health", headers: user_headers

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        get "/api/v1/admin/health"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET /api/v1/admin/stats" do
    before do
      create_list(:user, 3)
      plan = create(:plan, :professional)
      create_list(:subscription, 2, plan: plan, status: :active)
      create(:subscription, plan: plan, status: :trialing)
      create(:invoice, status: :paid, paid_at: Time.current)
    end

    context "as an admin" do
      it "returns platform statistics" do
        get "/api/v1/admin/stats", headers: admin_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        data = json["data"]

        expect(data["users"]).to include("total", "active", "new_this_month")
        expect(data["subscriptions"]).to include("total", "active", "trialing", "cancelled")
        expect(data["revenue"]).to include("mrr", "arr", "this_month")
        expect(data["invoices"]).to include("outstanding", "overdue")
      end

      it "includes generated_at timestamp" do
        get "/api/v1/admin/stats", headers: admin_headers

        json = JSON.parse(response.body)
        expect(json["generated_at"]).to be_present
      end
    end

    context "as a non-admin" do
      it "returns 403" do
        get "/api/v1/admin/stats", headers: user_headers

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        get "/api/v1/admin/stats"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
