# frozen_string_literal: true

module Api
  module V1
    class WebhooksController < ApplicationController
      skip_before_action :authenticate_request!
      before_action :verify_webhook_signature!

      # POST /api/v1/webhooks
      def receive
        event = params[:event]
        payload = params[:payload]

        case event
        when "payment.succeeded"
          handle_payment_succeeded(payload)
        when "payment.failed"
          handle_payment_failed(payload)
        when "subscription.renewed"
          handle_subscription_renewed(payload)
        when "subscription.expired"
          handle_subscription_expired(payload)
        when "invoice.created"
          handle_invoice_created(payload)
        else
          Rails.logger.warn("Unknown webhook event: #{event}")
        end

        render json: { received: true }, status: :ok
      rescue StandardError => e
        Rails.logger.error("Webhook processing error: #{e.message}")
        render json: { error: "Webhook processing failed" }, status: :internal_server_error
      end

      private

      def verify_webhook_signature!
        signature = request.headers["X-Webhook-Signature"]
        expected = OpenSSL::HMAC.hexdigest(
          "SHA256",
          ENV.fetch("WEBHOOK_SECRET", ""),
          request.raw_post
        )

        unless ActiveSupport::SecurityUtils.secure_compare(signature.to_s, "sha256=#{expected}")
          render json: { error: "Invalid webhook signature" }, status: :unauthorized
        end
      end

      def handle_payment_succeeded(payload)
        invoice = Invoice.find_by(external_id: payload[:invoice_id])
        return unless invoice

        invoice.mark_paid!(paid_at: Time.current)
        audit_log!(:invoice_paid_via_webhook, invoice)
      end

      def handle_payment_failed(payload)
        subscription = Subscription.find_by(external_id: payload[:subscription_id])
        return unless subscription

        subscription.mark_past_due!
        audit_log!(:payment_failed, subscription)
        # TODO: trigger dunning email
      end

      def handle_subscription_renewed(payload)
        subscription = Subscription.find_by(external_id: payload[:subscription_id])
        return unless subscription

        subscription.renew!(
          period_start: payload[:period_start],
          period_end: payload[:period_end]
        )
        audit_log!(:subscription_renewed, subscription)
      end

      def handle_subscription_expired(payload)
        subscription = Subscription.find_by(external_id: payload[:subscription_id])
        return unless subscription

        subscription.expire!
        audit_log!(:subscription_expired, subscription)
      end

      def handle_invoice_created(payload)
        # Handled by billing system; log for audit purposes
        Rails.logger.info("Invoice created via webhook: #{payload[:invoice_id]}")
      end
    end
  end
end
