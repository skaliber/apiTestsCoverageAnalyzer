# frozen_string_literal: true

class BillingService
  Result = Struct.new(:success, :invoice, :errors, keyword_init: true) do
    def success? = success
    def failure? = !success
  end

  def process_payment(invoice, params)
    payment_method_id = params[:payment_method_id]

    return Result.new(success: false, errors: ["Payment method required"]) if payment_method_id.blank?

    # Simulate payment processing (in production this would call Stripe/Braintree/etc.)
    payment_result = charge_payment_method(payment_method_id, invoice.amount, invoice.currency)

    if payment_result[:status] == "succeeded"
      invoice.mark_paid!(paid_at: Time.current)
      create_payment_record(invoice, payment_result)
      Result.new(success: true, invoice: invoice, errors: [])
    else
      Result.new(success: false, invoice: invoice, errors: [payment_result[:error] || "Payment declined"])
    end
  rescue StandardError => e
    Rails.logger.error("BillingService#process_payment error: #{e.message}")
    Result.new(success: false, errors: ["Payment processing failed: #{e.message}"])
  end

  def create_invoice_for_subscription(subscription)
    plan = subscription.plan
    period_start = subscription.current_period_start || Time.current
    period_end = subscription.current_period_end || period_start + 1.month

    invoice = Invoice.create!(
      subscription: subscription,
      user: subscription.user,
      amount: calculate_amount(subscription),
      currency: plan.currency || "USD",
      status: :pending,
      due_date: period_end + Invoice::PAYMENT_WINDOW_DAYS.days,
      billing_period_start: period_start,
      billing_period_end: period_end,
      line_items: build_line_items(subscription)
    )

    invoice
  end

  private

  def charge_payment_method(payment_method_id, amount, currency)
    # In production: Stripe::PaymentIntent.create(...)
    # Mock implementation for example
    { status: "succeeded", transaction_id: SecureRandom.hex(16) }
  end

  def create_payment_record(invoice, payment_result)
    # Record successful payment transaction
    Rails.logger.info("Payment recorded for invoice #{invoice.id}: #{payment_result[:transaction_id]}")
  end

  def calculate_amount(subscription)
    base_amount = subscription.plan.price
    coupon = subscription.coupon

    if coupon&.active?
      base_amount - coupon.discount_amount_for(base_amount)
    else
      base_amount
    end
  end

  def build_line_items(subscription)
    [
      {
        description: "#{subscription.plan.name} - #{subscription.plan.billing_cycle}",
        amount: subscription.plan.price,
        quantity: 1
      }
    ]
  end
end
