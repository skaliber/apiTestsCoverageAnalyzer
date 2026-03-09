# frozen_string_literal: true

class UsageService
  Result = Struct.new(:success, :usage_record, :errors, :quota, :current_usage, keyword_init: true) do
    def success? = success
    def failure? = !success
    def quota_exceeded? = !success && quota.present?
  end

  def initialize(subscription)
    @subscription = subscription
  end

  def summary(period_start: nil, period_end: nil)
    start_date = period_start ? Time.parse(period_start) : @subscription.current_period_start
    end_date = period_end ? Time.parse(period_end) : @subscription.current_period_end

    records = @subscription.usage_records
                           .where(recorded_at: start_date..end_date)
                           .group(:metric)
                           .sum(:quantity)

    quota = @subscription.plan.usage_quota

    {
      subscription_id: @subscription.id,
      period_start: start_date&.iso8601,
      period_end: end_date&.iso8601,
      quota: quota,
      metrics: records.map do |metric, total|
        {
          metric: metric,
          total: total,
          percentage_used: quota ? ((total.to_f / quota) * 100).round(2) : nil
        }
      end,
      total_usage: records.values.sum,
      quota_remaining: quota ? [quota - records.values.sum, 0].max : nil
    }
  end

  # Business Rule: usage-quota-enforcement
  def record(params)
    metric = params[:metric]
    quantity = params[:quantity].to_i

    current_period_usage = current_usage_for_metric(metric)
    quota = @subscription.plan.usage_quota

    if quota && (current_period_usage + quantity) > quota
      return Result.new(
        success: false,
        errors: ["Usage quota exceeded for #{metric}"],
        quota: quota,
        current_usage: current_period_usage
      )
    end

    usage_record = @subscription.usage_records.create!(
      metric: metric,
      quantity: quantity,
      recorded_at: params[:timestamp] ? Time.parse(params[:timestamp]) : Time.current,
      metadata: params[:metadata]
    )

    Result.new(
      success: true,
      usage_record: {
        id: usage_record.id,
        subscription_id: @subscription.id,
        metric: usage_record.metric,
        quantity: usage_record.quantity,
        recorded_at: usage_record.recorded_at.iso8601,
        period_total: current_period_usage + quantity,
        quota: quota,
        quota_remaining: quota ? quota - (current_period_usage + quantity) : nil
      },
      errors: []
    )
  rescue ActiveRecord::RecordInvalid => e
    Result.new(success: false, errors: [e.message])
  end

  private

  def current_usage_for_metric(metric)
    @subscription.usage_records
                 .where(
                   metric: metric,
                   recorded_at: @subscription.current_period_start..@subscription.current_period_end
                 )
                 .sum(:quantity)
  end
end
