# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Audit Logs
# Covers: index with all filter options

RSpec.describe "Audit Logs API - Complete Coverage", type: :request do
  let(:admin_user) { create(:user, :admin) }
  let(:regular_user) { create(:user) }
  let(:other_user) { create(:user) }

  let(:admin_headers) { auth_headers_for(admin_user) }
  let(:user_headers) { auth_headers_for(regular_user) }
  let(:other_headers) { auth_headers_for(other_user) }

  before do
    create_list(:audit_log, 5, user: regular_user, action: "user_updated", resource_type: "User")
    create_list(:audit_log, 3, user: other_user, action: "subscription_created", resource_type: "Subscription")
  end

  describe "GET /api/v1/audit-logs" do
    context "as an admin" do
      it "returns all audit logs with pagination" do
        get "/api/v1/audit-logs", headers: admin_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]).to be_an(Array)
        expect(json["meta"]).to include("current_page", "total_count")
      end

      it "filters by user_id" do
        get "/api/v1/audit-logs",
            params: { user_id: regular_user.id },
            headers: admin_headers

        json = JSON.parse(response.body)
        user_ids = json["data"].map { |l| l["user_id"] }.uniq
        expect(user_ids).to eq([regular_user.id])
      end

      it "filters by action" do
        get "/api/v1/audit-logs",
            params: { action: "user_updated" },
            headers: admin_headers

        json = JSON.parse(response.body)
        actions = json["data"].map { |l| l["action"] }.uniq
        expect(actions).to eq(["user_updated"])
      end

      it "filters by resource_type" do
        get "/api/v1/audit-logs",
            params: { resource_type: "Subscription" },
            headers: admin_headers

        json = JSON.parse(response.body)
        types = json["data"].map { |l| l["resource_type"] }.uniq
        expect(types).to eq(["Subscription"])
      end

      it "filters by date range" do
        get "/api/v1/audit-logs",
            params: {
              from: 1.hour.ago.iso8601,
              to: Time.current.iso8601
            },
            headers: admin_headers

        expect(response).to have_http_status(:ok)
      end

      it "returns logs in descending order" do
        get "/api/v1/audit-logs", headers: admin_headers

        json = JSON.parse(response.body)
        dates = json["data"].map { |l| Time.parse(l["created_at"]) }
        expect(dates).to eq(dates.sort.reverse)
      end
    end

    context "as a regular user" do
      it "can view their own audit logs when filtering by their user_id" do
        get "/api/v1/audit-logs",
            params: { user_id: regular_user.id },
            headers: user_headers

        expect(response).to have_http_status(:ok)
      end

      it "returns 403 when not filtering by own user_id" do
        get "/api/v1/audit-logs", headers: user_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 403 when filtering by another user's user_id" do
        get "/api/v1/audit-logs",
            params: { user_id: other_user.id },
            headers: user_headers

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        get "/api/v1/audit-logs"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
