# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Invoices
# Covers: list, show, pay - including business rule: invoice-payment-window

RSpec.describe "Invoices API - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:admin_user) { create(:user, :admin) }
  let(:other_user) { create(:user) }

  let(:plan) { create(:plan, :professional) }
  let(:subscription) { create(:subscription, user: user, plan: plan) }

  let(:auth_headers) { auth_headers_for(user) }
  let(:admin_headers) { auth_headers_for(admin_user) }
  let(:other_headers) { auth_headers_for(other_user) }

  describe "GET /api/v1/invoices" do
    before { create_list(:invoice, 5, user: user, subscription: subscription) }

    it "returns paginated invoices for the current user" do
      get "/api/v1/invoices", headers: auth_headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["data"]).to be_an(Array)
      expect(json["data"].length).to eq(5)
      expect(json["meta"]).to include("current_page", "total_count")
    end

    it "returns invoices sorted by created_at descending" do
      get "/api/v1/invoices", headers: auth_headers

      json = JSON.parse(response.body)
      dates = json["data"].map { |i| Time.parse(i["created_at"]) }
      expect(dates).to eq(dates.sort.reverse)
    end

    it "does not return other users' invoices" do
      other_subscription = create(:subscription, user: other_user, plan: plan)
      create(:invoice, user: other_user, subscription: other_subscription)

      get "/api/v1/invoices", headers: auth_headers

      json = JSON.parse(response.body)
      user_ids = json["data"].map { |i| i["user_id"] }
      expect(user_ids.uniq).to eq([user.id])
    end

    it "returns 401 without a token" do
      get "/api/v1/invoices"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/v1/invoices/:id" do
    let(:invoice) { create(:invoice, user: user, subscription: subscription) }

    context "as the invoice owner" do
      it "returns invoice details" do
        get "/api/v1/invoices/#{invoice.id}", headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["id"]).to eq(invoice.id)
        expect(json["data"]["amount"]).to be_a(Numeric)
        expect(json["data"]["status"]).to be_present
        expect(json["data"]["due_date"]).to be_present
      end
    end

    context "as an admin" do
      it "allows access to any invoice" do
        get "/api/v1/invoices/#{invoice.id}", headers: admin_headers

        expect(response).to have_http_status(:ok)
      end
    end

    context "as another user" do
      it "returns 403" do
        get "/api/v1/invoices/#{invoice.id}", headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end
    end

    context "with non-existent invoice" do
      it "returns 404" do
        get "/api/v1/invoices/99999999", headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    it "returns 401 without a token" do
      get "/api/v1/invoices/#{invoice.id}"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/invoices/:id/pay" do
    # Business Rule: invoice-payment-window

    context "with a valid pending invoice within payment window" do
      let(:invoice) do
        create(:invoice, user: user, subscription: subscription,
               status: :pending, due_date: 15.days.from_now)
      end

      it "processes the payment and returns 200" do
        post "/api/v1/invoices/#{invoice.id}/pay",
             params: { payment_method_id: "pm_test_visa" },
             headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["status"]).to eq("paid")
        expect(json["data"]["paid_at"]).not_to be_nil
      end

      it "creates an audit log entry" do
        expect {
          post "/api/v1/invoices/#{invoice.id}/pay",
               params: { payment_method_id: "pm_test_visa" },
               headers: auth_headers
        }.to change(AuditLog, :count).by(1)
      end
    end

    context "with an overdue invoice (business rule: invoice-payment-window)" do
      let(:invoice) do
        create(:invoice, user: user, subscription: subscription,
               status: :past_due, due_date: 35.days.ago)
      end

      it "returns 422 with overdue message" do
        post "/api/v1/invoices/#{invoice.id}/pay",
             params: { payment_method_id: "pm_test_visa" },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["error"]).to match(/overdue/i)
      end
    end

    context "with an already paid invoice" do
      let(:invoice) do
        create(:invoice, user: user, subscription: subscription,
               status: :paid, paid_at: 1.day.ago, due_date: 15.days.from_now)
      end

      it "returns 422 with already paid message" do
        post "/api/v1/invoices/#{invoice.id}/pay",
             params: { payment_method_id: "pm_test_visa" },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["error"]).to match(/already paid/i)
      end
    end

    context "auth and access control" do
      let(:invoice) { create(:invoice, user: user, subscription: subscription, status: :pending, due_date: 15.days.from_now) }

      it "returns 403 for another user's invoice" do
        post "/api/v1/invoices/#{invoice.id}/pay",
             params: { payment_method_id: "pm_test_visa" },
             headers: other_headers

        expect(response).to have_http_status(:forbidden)
      end

      it "returns 404 for non-existent invoice" do
        post "/api/v1/invoices/99999999/pay",
             params: { payment_method_id: "pm_test_visa" },
             headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end

      it "returns 401 without a token" do
        post "/api/v1/invoices/#{invoice.id}/pay",
             params: { payment_method_id: "pm_test_visa" }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
