# frozen_string_literal: true

require "rails_helper"

# PARTIAL COVERAGE SPEC - spec-initial
# This file covers approximately 50% of subscription endpoints.
# Missing: upgrade flow, cancel (POST) endpoint, DELETE immediate cancellation,
# business rule tests for seat-limit and subscription-downgrade,
# auth access control tests, and error paths.

RSpec.describe "Subscriptions API", type: :request do
  let(:user) { create(:user) }
  let(:plan) { create(:plan, :professional) }
  let(:auth_headers) { auth_headers_for(user) }

  describe "POST /api/v1/subscriptions" do
    context "when creating a first subscription" do
      it "creates a subscription on a valid plan" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: plan.id, billing_cycle: "monthly" } },
             headers: auth_headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json["data"]["status"]).to eq("trialing")
        expect(json["data"]["plan"]["id"]).to eq(plan.id)
      end

      it "sets trial period for first-time subscribers" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: plan.id } },
             headers: auth_headers

        json = JSON.parse(response.body)
        expect(json["data"]["trial_end_date"]).not_to be_nil
      end

      it "returns 422 with invalid plan_id" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: 99999 } },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    context "with a coupon code" do
      let(:coupon) { create(:coupon, :percentage_discount) }

      it "applies a valid coupon" do
        post "/api/v1/subscriptions",
             params: {
               subscription: {
                 plan_id: plan.id,
                 coupon_code: coupon.code
               }
             },
             headers: auth_headers

        expect(response).to have_http_status(:created)
      end

      it "returns 422 with an invalid coupon code" do
        post "/api/v1/subscriptions",
             params: {
               subscription: {
                 plan_id: plan.id,
                 coupon_code: "INVALID_CODE"
               }
             },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"]).to include(match(/coupon/i))
      end
    end
  end

  describe "GET /api/v1/subscriptions/:id" do
    let(:subscription) { create(:subscription, user: user, plan: plan) }

    it "returns subscription details for the owner" do
      get "/api/v1/subscriptions/#{subscription.id}", headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]["id"]).to eq(subscription.id)
      expect(json["data"]["seats_used"]).to be_a(Integer)
      expect(json["data"]["seats_limit"]).to be_a(Integer)
    end

    it "returns 404 for non-existent subscription" do
      get "/api/v1/subscriptions/99999999", headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end

    it "returns 403 when accessing another user's subscription" do
      other_user = create(:user)
      other_subscription = create(:subscription, user: other_user, plan: plan)

      get "/api/v1/subscriptions/#{other_subscription.id}", headers: auth_headers

      expect(response).to have_http_status(:forbidden)
    end

    # NOTE: Missing test - 401 when unauthenticated
  end

  describe "PUT /api/v1/subscriptions/:id" do
    let(:subscription) { create(:subscription, user: user, plan: plan) }

    it "updates the subscription" do
      new_plan = create(:plan, :starter)

      put "/api/v1/subscriptions/#{subscription.id}",
          params: { subscription: { plan_id: new_plan.id } },
          headers: auth_headers

      expect(response).to have_http_status(:ok)
    end

    # NOTE: Missing tests:
    # - Business rule: subscription-downgrade-seats not tested
    # - 403 when accessing another user's subscription
    # - 404 when subscription not found
  end

  # NOTE: The following endpoints are NOT covered in spec-initial:
  # - GET /api/v1/subscriptions/:id/upgrade - UNCOVERED
  # - POST /api/v1/subscriptions/:id/cancel - UNCOVERED
  #   (Business Rule: subscription-cancellation-period - completely uncovered)
  # - DELETE /api/v1/subscriptions/:id - UNCOVERED
end
