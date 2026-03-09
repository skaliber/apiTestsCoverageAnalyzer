# frozen_string_literal: true

class SubscriptionService
  Result = Struct.new(:success, :subscription, :errors, keyword_init: true) do
    def success? = success
    def failure? = !success
  end

  def initialize(current_user)
    @current_user = current_user
  end

  def create(params)
    plan = Plan.find(params[:plan_id])
    coupon = resolve_coupon(params[:coupon_code])

    return Result.new(success: false, errors: ["Invalid coupon"]) if params[:coupon_code].present? && coupon.nil?

    subscription = Subscription.new(
      user: @current_user,
      plan: plan,
      coupon: coupon,
      status: trial_eligible? ? :trialing : :active,
      current_period_start: Time.current,
      current_period_end: calculate_period_end(plan),
      trial_end_date: trial_eligible? ? Time.current + 14.days : nil
    )

    if subscription.save
      BillingService.new.create_invoice_for_subscription(subscription) unless subscription.trialing?
      Result.new(success: true, subscription: subscription, errors: [])
    else
      Result.new(success: false, errors: subscription.errors.full_messages)
    end
  rescue ActiveRecord::RecordNotFound
    Result.new(success: false, errors: ["Plan not found"])
  end

  def update(subscription, params)
    if params[:plan_id].present? && params[:plan_id] != subscription.plan_id.to_s
      return upgrade_or_downgrade(subscription, Plan.find(params[:plan_id]))
    end

    if subscription.update(params.except(:plan_id, :coupon_code))
      Result.new(success: true, subscription: subscription, errors: [])
    else
      Result.new(success: false, errors: subscription.errors.full_messages)
    end
  end

  def upgrade(subscription, new_plan)
    old_plan = subscription.plan
    return Result.new(success: false, errors: ["Already on this plan"]) if old_plan.id == new_plan.id

    ActiveRecord::Base.transaction do
      # Business Rule: subscription-downgrade-seats
      if new_plan.downgrade_from?(old_plan) && subscription.seats.active.count > new_plan.seat_limit
        excess_seats = subscription.seats.active.count - new_plan.seat_limit
        subscription.seats.active.order(created_at: :asc).limit(excess_seats).each(&:deactivate!)
      end

      subscription.update!(plan: new_plan)
      BillingService.new.create_invoice_for_subscription(subscription)
    end

    Result.new(success: true, subscription: subscription.reload, errors: [])
  rescue ActiveRecord::RecordInvalid => e
    Result.new(success: false, errors: [e.message])
  end

  def cancel(subscription, immediate: false)
    unless subscription.active? || subscription.trialing?
      return Result.new(success: false, errors: ["Subscription is already #{subscription.status}"])
    end

    subscription.cancel!(immediate: immediate)
    Result.new(success: true, subscription: subscription, errors: [])
  rescue ActiveRecord::RecordInvalid => e
    Result.new(success: false, errors: [e.message])
  end

  private

  def trial_eligible?
    @current_user.subscriptions.none?
  end

  def resolve_coupon(code)
    return nil if code.blank?

    Coupon.find_by(code: code)&.tap do |coupon|
      return nil unless coupon.active?
    end
  end

  def calculate_period_end(plan)
    case plan.billing_cycle
    when "monthly" then Time.current + 1.month
    when "yearly" then Time.current + 1.year
    else Time.current + 1.month
    end
  end

  def upgrade_or_downgrade(subscription, new_plan)
    upgrade(subscription, new_plan)
  end
end
