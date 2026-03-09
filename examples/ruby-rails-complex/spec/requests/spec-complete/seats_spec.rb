# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Seats
# Covers: index, create, destroy - including business rule: seat-limit-per-plan

RSpec.describe "Seats API - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:admin_user) { create(:user, :admin) }

  let(:plan) { create(:plan, :starter, seat_limit: 3) }
  let(:subscription) { create(:subscription, user: user, plan: plan, status: :active) }

  let(:auth_headers) { auth_headers_for(user) }
  let(:other_headers) { auth_headers_for(other_user) }
  let(:admin_headers) { auth_headers_for(admin_user) }

  describe "GET /api/v1/subscriptions/:subscription_id/seats" do
    before { create_list(:seat, 2, subscription: subscription) }

    it "returns active seats with quota metadata" do
      get seats_path(subscription.id), headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]).to be_an(Array)
      expect(json["meta"]["seats_used"]).to eq(2)
      expect(json["meta"]["seats_limit"]).to eq(3)
      expect(json["meta"]["seats_available"]).to eq(1)
    end

    it "returns 403 for another user's subscription" do
      get seats_path(subscription.id), headers: other_headers

      expect(response).to have_http_status(:forbidden)
    end

    it "returns 404 for non-existent subscription" do
      get seats_path(99999), headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end

    it "returns 401 without a token" do
      get seats_path(subscription.id)

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/subscriptions/:subscription_id/seats" do
    let(:member) { create(:user) }

    context "with available seats (below limit)" do
      it "adds a seat for an existing user" do
        post seats_path(subscription.id),
             params: { seat: { email: member.email, role: "member" } },
             headers: auth_headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json["data"]["user"]["email"]).to eq(member.email)
        expect(json["data"]["role"]).to eq("member")
      end

      it "creates an audit log entry" do
        expect {
          post seats_path(subscription.id),
               params: { seat: { email: member.email } },
               headers: auth_headers
        }.to change(AuditLog, :count).by(1)
      end
    end

    context "at seat limit (business rule: seat-limit-per-plan)" do
      before { create_list(:seat, 3, subscription: subscription) }

      it "returns 422 with seat limit error and upgrade URL" do
        post seats_path(subscription.id),
             params: { seat: { email: member.email } },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["error"]).to match(/seat limit/i)
        expect(json["seats_limit"]).to eq(3)
        expect(json["upgrade_url"]).to be_present
      end

      it "does not create the seat" do
        expect {
          post seats_path(subscription.id),
               params: { seat: { email: member.email } },
               headers: auth_headers
        }.not_to change(Seat, :count)
      end
    end

    context "with non-existent user email" do
      it "returns 404" do
        post seats_path(subscription.id),
             params: { seat: { email: "nonexistent@example.com" } },
             headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "with duplicate seat" do
      before { create(:seat, subscription: subscription, user: member) }

      it "returns 422 for duplicate user seat" do
        post seats_path(subscription.id),
             params: { seat: { email: member.email } },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    context "auth" do
      it "returns 403 for another user's subscription" do
        post seats_path(subscription.id),
             params: { seat: { email: member.email } },
             headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 401 without a token" do
        post seats_path(subscription.id), params: { seat: { email: member.email } }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "DELETE /api/v1/subscriptions/:subscription_id/seats/:id" do
    let(:member) { create(:user) }
    let(:seat) { create(:seat, subscription: subscription, user: member) }

    context "as subscription owner" do
      it "deactivates the seat" do
        delete seat_path(subscription.id, seat.id), headers: auth_headers

        expect(response).to have_http_status(:ok)
        expect(seat.reload.status).to eq("deactivated")
      end

      it "creates an audit log" do
        expect {
          delete seat_path(subscription.id, seat.id), headers: auth_headers
        }.to change(AuditLog, :count).by(1)
      end
    end

    context "removing own seat (non-admin)" do
      let(:seat) { create(:seat, subscription: subscription, user: user) }

      it "returns 403" do
        delete seat_path(subscription.id, seat.id), headers: auth_headers

        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)["error"]).to match(/own seat/i)
      end
    end

    context "with non-existent seat" do
      it "returns 404" do
        delete seat_path(subscription.id, 99999), headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "auth" do
      it "returns 403 for another user's subscription" do
        delete seat_path(subscription.id, seat.id), headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 401 without a token" do
        delete seat_path(subscription.id, seat.id)

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
