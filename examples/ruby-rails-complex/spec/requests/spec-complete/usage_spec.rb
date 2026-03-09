# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Usage
# Covers: show, record - including business rules:
#   active-subscription-required, usage-quota-enforcement

RSpec.describe "Usage API - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:plan) { create(:plan, :professional, usage_quota: 1000) }
  let(:subscription) { create(:subscription, user: user, plan: plan, status: :active) }

  let(:auth_headers) { auth_headers_for(user) }
  let(:other_headers) { auth_headers_for(other_user) }

  describe "GET /api/v1/usage/:subscription_id" do
    context "with an active subscription" do
      it "returns usage summary" do
        get "/api/v1/usage/#{subscription.id}", headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]).to include(
          "subscription_id", "quota", "total_usage", "quota_remaining"
        )
      end

      it "supports period filtering" do
        get "/api/v1/usage/#{subscription.id}",
            params: { period_start: 1.month.ago.iso8601, period_end: Time.current.iso8601 },
            headers: auth_headers

        expect(response).to have_http_status(:ok)
      end
    end

    context "with an inactive subscription (business rule: active-subscription-required)" do
      let(:cancelled_subscription) do
        create(:subscription, user: user, plan: plan, status: :cancelled)
      end

      it "returns 402 for cancelled subscription" do
        get "/api/v1/usage/#{cancelled_subscription.id}", headers: auth_headers

        expect(response).to have_http_status(:payment_required)
        expect(JSON.parse(response.body)["error"]).to match(/active subscription/i)
      end

      it "returns 402 for expired subscription" do
        expired_sub = create(:subscription, user: user, plan: plan, status: :expired)

        get "/api/v1/usage/#{expired_sub.id}", headers: auth_headers

        expect(response).to have_http_status(:payment_required)
      end
    end

    context "auth and access control" do
      it "returns 403 for another user's subscription" do
        get "/api/v1/usage/#{subscription.id}", headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 404 for non-existent subscription" do
        get "/api/v1/usage/99999999", headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end

      it "returns 401 without a token" do
        get "/api/v1/usage/#{subscription.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "POST /api/v1/usage/record" do
    let(:valid_params) do
      {
        subscription_id: subscription.id,
        usage: {
          metric: "api_calls",
          quantity: 10
        }
      }
    end

    context "within quota (business rule: usage-quota-enforcement)" do
      it "records the usage event" do
        post "/api/v1/usage/record", params: valid_params, headers: auth_headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json["data"]["metric"]).to eq("api_calls")
        expect(json["data"]["quantity"]).to eq(10)
        expect(json["data"]["quota_remaining"]).to eq(990)
      end

      it "tracks period total in response" do
        post "/api/v1/usage/record", params: valid_params, headers: auth_headers

        json = JSON.parse(response.body)
        expect(json["data"]["period_total"]).to eq(10)
      end
    end

    context "exceeding quota (business rule: usage-quota-enforcement)" do
      before do
        create(:usage_record, subscription: subscription, metric: "api_calls", quantity: 995)
      end

      it "returns 422 when recording would exceed quota" do
        post "/api/v1/usage/record",
             params: {
               subscription_id: subscription.id,
               usage: { metric: "api_calls", quantity: 10 }
             },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["error"]).to match(/quota exceeded/i)
        expect(json["quota"]).to eq(1000)
        expect(json["current_usage"]).to eq(995)
      end

      it "does not create the usage record" do
        expect {
          post "/api/v1/usage/record",
               params: {
                 subscription_id: subscription.id,
                 usage: { metric: "api_calls", quantity: 10 }
               },
               headers: auth_headers
        }.not_to change(UsageRecord, :count)
      end
    end

    context "with inactive subscription (business rule: active-subscription-required)" do
      let(:cancelled_subscription) { create(:subscription, user: user, plan: plan, status: :cancelled) }

      it "returns 402" do
        post "/api/v1/usage/record",
             params: { subscription_id: cancelled_subscription.id, usage: { metric: "api_calls", quantity: 1 } },
             headers: auth_headers

        expect(response).to have_http_status(:payment_required)
      end
    end

    context "with non-existent subscription" do
      it "returns 404" do
        post "/api/v1/usage/record",
             params: { subscription_id: 99999, usage: { metric: "api_calls", quantity: 1 } },
             headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        post "/api/v1/usage/record", params: valid_params

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
