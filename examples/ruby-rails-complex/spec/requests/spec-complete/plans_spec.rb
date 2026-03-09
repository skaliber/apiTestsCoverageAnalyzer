# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Plans
# Covers: index, show

RSpec.describe "Plans API - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:auth_headers) { auth_headers_for(user) }

  before do
    create(:plan, :starter)
    create(:plan, :professional)
    create(:plan, :enterprise)
    create(:plan, :inactive)
  end

  describe "GET /api/v1/plans" do
    it "returns all active plans sorted by price" do
      get "/api/v1/plans", headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]).to be_an(Array)
      # Should only include active plans
      expect(json["data"].map { |p| p["active"] }.uniq).to eq([true])
    end

    it "includes all required plan fields" do
      get "/api/v1/plans", headers: auth_headers

      json = JSON.parse(response.body)
      first_plan = json["data"].first
      expect(first_plan.keys).to include(
        "id", "name", "price", "billing_cycle", "seat_limit",
        "usage_quota", "features", "popular", "active"
      )
    end

    it "returns plans ordered by price ascending" do
      get "/api/v1/plans", headers: auth_headers

      json = JSON.parse(response.body)
      prices = json["data"].map { |p| p["price"] }
      expect(prices).to eq(prices.sort)
    end

    it "returns 401 without a token" do
      get "/api/v1/plans"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/v1/plans/:id" do
    let(:plan) { Plan.active.first }

    it "returns the plan" do
      get "/api/v1/plans/#{plan.id}", headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]["id"]).to eq(plan.id)
    end

    it "returns 404 for non-existent plan" do
      get "/api/v1/plans/99999", headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end

    it "returns 401 without a token" do
      get "/api/v1/plans/#{plan.id}"

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
