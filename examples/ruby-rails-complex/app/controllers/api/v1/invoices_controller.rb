# frozen_string_literal: true

module Api
  module V1
    class InvoicesController < ApplicationController
      before_action :authenticate_request!
      before_action :set_invoice, only: [:show, :pay]

      # GET /api/v1/invoices
      def index
        @invoices = current_user.invoices
                                .includes(:subscription)
                                .order(created_at: :desc)
                                .page(params[:page])
                                .per(params[:per_page] || 25)

        render json: {
          data: @invoices.map { |inv| invoice_json(inv) },
          meta: pagination_meta(@invoices)
        }
      end

      # GET /api/v1/invoices/:id
      def show
        authorize_invoice_access!
        render json: { data: invoice_json(@invoice) }
      end

      # POST /api/v1/invoices/:id/pay
      # Business Rule: invoice-payment-window
      def pay
        authorize_invoice_access!

        if @invoice.overdue?
          render json: { error: "Invoice is overdue and cannot be paid through this endpoint" },
                 status: :unprocessable_entity
          return
        end

        if @invoice.paid?
          render json: { error: "Invoice is already paid" }, status: :unprocessable_entity
          return
        end

        result = BillingService.new.process_payment(@invoice, payment_params)

        if result.success?
          audit_log!(:invoice_paid, @invoice)
          render json: { data: invoice_json(result.invoice), message: "Payment processed successfully" }
        else
          render json: { errors: result.errors }, status: :payment_required
        end
      end

      private

      def set_invoice
        @invoice = Invoice.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Invoice not found" }, status: :not_found
      end

      def authorize_invoice_access!
        return if current_user.admin? || @invoice.user_id == current_user.id

        render json: { error: "Access denied" }, status: :forbidden
      end

      def payment_params
        params.permit(:payment_method_id, :amount)
      end

      def invoice_json(invoice)
        {
          id: invoice.id,
          subscription_id: invoice.subscription_id,
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
          due_date: invoice.due_date&.iso8601,
          paid_at: invoice.paid_at&.iso8601,
          line_items: invoice.line_items,
          billing_period_start: invoice.billing_period_start&.iso8601,
          billing_period_end: invoice.billing_period_end&.iso8601,
          created_at: invoice.created_at.iso8601
        }
      end
    end
  end
end
