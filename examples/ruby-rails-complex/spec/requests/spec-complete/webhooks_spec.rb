# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Webhooks
# Covers: receive with all event types, signature verification

RSpec.describe "Webhooks API - Complete Coverage", type: :request do
  let(:webhook_secret) { "test_webhook_secret" }

  before do
    allow(ENV).to receive(:fetch).with("WEBHOOK_SECRET", "").and_return(webhook_secret)
  end

  def valid_webhook_headers(payload)
    body = payload.to_json
    sig = "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", webhook_secret, body)
    {
      "X-Webhook-Signature" => sig,
      "Content-Type" => "application/json"
    }
  end

  describe "POST /api/v1/webhooks" do
    context "with valid signature" do
      it "accepts payment.succeeded event" do
        invoice = create(:invoice, status: :pending, external_id: "inv_123")
        payload = { event: "payment.succeeded", payload: { invoice_id: "inv_123" } }

        post "/api/v1/webhooks", params: payload, headers: valid_webhook_headers(payload)

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["received"]).to eq(true)
        expect(invoice.reload.status).to eq("paid")
      end

      it "accepts payment.failed event" do
        subscription = create(:subscription, status: :active, external_id: "sub_123")
        payload = { event: "payment.failed", payload: { subscription_id: "sub_123" } }

        post "/api/v1/webhooks", params: payload, headers: valid_webhook_headers(payload)

        expect(response).to have_http_status(:ok)
        expect(subscription.reload.status).to eq("past_due")
      end

      it "accepts subscription.renewed event" do
        subscription = create(:subscription, status: :active, external_id: "sub_456")
        payload = {
          event: "subscription.renewed",
          payload: {
            subscription_id: "sub_456",
            period_start: Time.current.iso8601,
            period_end: 1.month.from_now.iso8601
          }
        }

        post "/api/v1/webhooks", params: payload, headers: valid_webhook_headers(payload)

        expect(response).to have_http_status(:ok)
      end

      it "accepts subscription.expired event" do
        subscription = create(:subscription, status: :active, external_id: "sub_789")
        payload = { event: "subscription.expired", payload: { subscription_id: "sub_789" } }

        post "/api/v1/webhooks", params: payload, headers: valid_webhook_headers(payload)

        expect(response).to have_http_status(:ok)
        expect(subscription.reload.status).to eq("expired")
      end

      it "accepts invoice.created event gracefully" do
        payload = { event: "invoice.created", payload: { invoice_id: "inv_new_001" } }

        post "/api/v1/webhooks", params: payload, headers: valid_webhook_headers(payload)

        expect(response).to have_http_status(:ok)
      end

      it "accepts unknown events without raising an error" do
        payload = { event: "unknown.event", payload: {} }

        post "/api/v1/webhooks", params: payload, headers: valid_webhook_headers(payload)

        expect(response).to have_http_status(:ok)
      end
    end

    context "with invalid signature" do
      it "returns 401" do
        payload = { event: "payment.succeeded", payload: { invoice_id: "inv_123" } }
        bad_headers = {
          "X-Webhook-Signature" => "sha256=invalidsignature",
          "Content-Type" => "application/json"
        }

        post "/api/v1/webhooks", params: payload, headers: bad_headers

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "with missing signature" do
      it "returns 401" do
        payload = { event: "payment.succeeded", payload: {} }

        post "/api/v1/webhooks",
             params: payload,
             headers: { "Content-Type" => "application/json" }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
