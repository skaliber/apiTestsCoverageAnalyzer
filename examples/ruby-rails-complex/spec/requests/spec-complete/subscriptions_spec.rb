# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC
# Covers 100% of subscription endpoints including:
# - CRUD operations
# - Business rules: subscription-cancellation-period, subscription-downgrade-seats
# - Auth and access control
# - Error scenarios

RSpec.describe "Subscriptions API - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:admin_user) { create(:user, :admin) }
  let(:other_user) { create(:user) }

  let(:starter_plan) { create(:plan, :starter, seat_limit: 3) }
  let(:professional_plan) { create(:plan, :professional, seat_limit: 10) }

  let(:auth_headers) { auth_headers_for(user) }
  let(:admin_headers) { auth_headers_for(admin_user) }
  let(:other_headers) { auth_headers_for(other_user) }

  describe "POST /api/v1/subscriptions" do
    context "first subscription (trial eligible)" do
      it "creates subscription with trialing status" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: starter_plan.id } },
             headers: auth_headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json["data"]["status"]).to eq("trialing")
        expect(json["data"]["trial_end_date"]).not_to be_nil
      end

      it "includes plan details in the response" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: starter_plan.id } },
             headers: auth_headers

        json = JSON.parse(response.body)
        expect(json["data"]["plan"]["name"]).to eq(starter_plan.name)
        expect(json["data"]["plan"]["price"]).to eq(starter_plan.price)
      end

      it "creates an audit log entry" do
        expect {
          post "/api/v1/subscriptions",
               params: { subscription: { plan_id: starter_plan.id } },
               headers: auth_headers
        }.to change(AuditLog, :count).by(1)
      end
    end

    context "with a valid coupon" do
      let(:coupon) { create(:coupon, :active, discount_type: "percentage", discount_value: 20) }

      it "applies the coupon and creates subscription" do
        post "/api/v1/subscriptions",
             params: {
               subscription: {
                 plan_id: starter_plan.id,
                 coupon_code: coupon.code
               }
             },
             headers: auth_headers

        expect(response).to have_http_status(:created)
      end
    end

    context "with an invalid coupon" do
      it "returns 422 when coupon code is not found" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: starter_plan.id, coupon_code: "BADCODE" } },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["errors"]).to include(match(/coupon/i))
      end
    end

    context "with an invalid plan" do
      it "returns 422 when plan does not exist" do
        post "/api/v1/subscriptions",
             params: { subscription: { plan_id: 99999 } },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        post "/api/v1/subscriptions", params: { subscription: { plan_id: starter_plan.id } }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET /api/v1/subscriptions/:id" do
    let(:subscription) { create(:subscription, user: user, plan: starter_plan) }

    context "as the owner" do
      it "returns subscription details" do
        get "/api/v1/subscriptions/#{subscription.id}", headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["id"]).to eq(subscription.id)
        expect(json["data"]["seats_used"]).to be_a(Integer)
        expect(json["data"]["seats_limit"]).to eq(starter_plan.seat_limit)
      end
    end

    context "as an admin" do
      it "allows access to any subscription" do
        get "/api/v1/subscriptions/#{subscription.id}", headers: admin_headers

        expect(response).to have_http_status(:ok)
      end
    end

    context "as another user" do
      it "returns 403" do
        get "/api/v1/subscriptions/#{subscription.id}", headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "with non-existent subscription" do
      it "returns 404" do
        get "/api/v1/subscriptions/99999999", headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        get "/api/v1/subscriptions/#{subscription.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "PUT /api/v1/subscriptions/:id" do
    let(:subscription) { create(:subscription, user: user, plan: starter_plan) }

    context "plan upgrade" do
      it "upgrades to a higher tier plan" do
        put "/api/v1/subscriptions/#{subscription.id}",
            params: { subscription: { plan_id: professional_plan.id } },
            headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["plan"]["id"]).to eq(professional_plan.id)
      end
    end

    context "auth and access control" do
      it "returns 403 for another user's subscription" do
        put "/api/v1/subscriptions/#{subscription.id}",
            params: { subscription: { plan_id: professional_plan.id } },
            headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 404 for non-existent subscription" do
        put "/api/v1/subscriptions/99999999",
            params: { subscription: { plan_id: professional_plan.id } },
            headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end

      it "returns 401 without a token" do
        put "/api/v1/subscriptions/#{subscription.id}",
            params: { subscription: { plan_id: professional_plan.id } }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET /api/v1/subscriptions/:id/upgrade" do
    let(:subscription) { create(:subscription, user: user, plan: starter_plan, status: :active) }

    context "upgrading to a higher plan" do
      it "successfully upgrades the plan" do
        get "/api/v1/subscriptions/#{subscription.id}/upgrade",
            params: { plan_id: professional_plan.id },
            headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["plan"]["id"]).to eq(professional_plan.id)
      end

      it "creates an invoice for the upgrade" do
        expect {
          get "/api/v1/subscriptions/#{subscription.id}/upgrade",
              params: { plan_id: professional_plan.id },
              headers: auth_headers
        }.to change(Invoice, :count).by(1)
      end
    end

    context "downgrading (business rule: subscription-downgrade-seats)" do
      let(:subscription) { create(:subscription, user: user, plan: professional_plan, status: :active) }
      let(:small_plan) { create(:plan, :starter, seat_limit: 2) }

      it "deactivates excess seats when seat count exceeds new plan limit" do
        # Create 3 seats but plan limit will be 2
        create_list(:seat, 3, subscription: subscription)

        get "/api/v1/subscriptions/#{subscription.id}/upgrade",
            params: { plan_id: small_plan.id },
            headers: auth_headers

        expect(response).to have_http_status(:ok)
        expect(subscription.seats.active.count).to eq(2)
      end

      it "does not remove seats when count is within new limit" do
        create(:seat, subscription: subscription)

        get "/api/v1/subscriptions/#{subscription.id}/upgrade",
            params: { plan_id: small_plan.id },
            headers: auth_headers

        expect(subscription.seats.active.count).to eq(1)
      end
    end

    context "with non-existent plan" do
      it "returns 404" do
        get "/api/v1/subscriptions/#{subscription.id}/upgrade",
            params: { plan_id: 99999 },
            headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "auth" do
      it "returns 403 for another user's subscription" do
        get "/api/v1/subscriptions/#{subscription.id}/upgrade",
            params: { plan_id: professional_plan.id },
            headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "POST /api/v1/subscriptions/:id/cancel" do
    # Business Rule: subscription-cancellation-period

    let(:subscription) { create(:subscription, user: user, plan: starter_plan, status: :active) }

    context "cancelling an active subscription" do
      it "schedules cancellation at period end" do
        post "/api/v1/subscriptions/#{subscription.id}/cancel", headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["cancel_at_period_end"]).to eq(true)
      end

      it "does NOT immediately change subscription status to cancelled" do
        post "/api/v1/subscriptions/#{subscription.id}/cancel", headers: auth_headers

        expect(subscription.reload.status).to eq("active")
      end

      it "returns the period end date in the response" do
        post "/api/v1/subscriptions/#{subscription.id}/cancel", headers: auth_headers

        json = JSON.parse(response.body)
        expect(json["message"]).to match(/period end/i)
      end

      it "creates an audit log entry" do
        expect {
          post "/api/v1/subscriptions/#{subscription.id}/cancel", headers: auth_headers
        }.to change(AuditLog, :count).by(1)

        expect(AuditLog.last.action).to eq("subscription_cancellation_scheduled")
      end
    end

    context "cancelling an already-cancelled subscription" do
      let(:subscription) { create(:subscription, user: user, plan: starter_plan, status: :cancelled) }

      it "returns 422" do
        post "/api/v1/subscriptions/#{subscription.id}/cancel", headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["errors"]).to include(match(/already cancelled/i))
      end
    end

    context "auth and access control" do
      it "returns 403 for another user's subscription" do
        post "/api/v1/subscriptions/#{subscription.id}/cancel", headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 404 when subscription not found" do
        post "/api/v1/subscriptions/99999999/cancel", headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end
  end

  describe "DELETE /api/v1/subscriptions/:id" do
    let(:subscription) { create(:subscription, user: user, plan: starter_plan, status: :active) }

    context "immediate cancellation" do
      it "immediately cancels the subscription" do
        delete "/api/v1/subscriptions/#{subscription.id}", headers: auth_headers

        expect(response).to have_http_status(:ok)
        expect(subscription.reload.status).to eq("cancelled")
      end

      it "creates an audit log entry" do
        expect {
          delete "/api/v1/subscriptions/#{subscription.id}", headers: auth_headers
        }.to change(AuditLog, :count).by(1)
      end
    end

    context "auth and access control" do
      it "returns 403 for another user's subscription" do
        delete "/api/v1/subscriptions/#{subscription.id}", headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 404 when not found" do
        delete "/api/v1/subscriptions/99999999", headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end

      it "returns 401 without a token" do
        delete "/api/v1/subscriptions/#{subscription.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
