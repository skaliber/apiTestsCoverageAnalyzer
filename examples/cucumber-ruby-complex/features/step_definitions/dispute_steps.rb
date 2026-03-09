# frozen_string_literal: true

# dispute_steps.rb - Step definitions for dispute resolution scenarios
# Resolution chain: Feature file -> step def -> DisputeApiHelper -> PathConstants -> HTTP call

When("I retrieve the dispute details") do
  dispute_id = @last_dispute["dispute_id"]
  @response = DisputeApiHelper.get_dispute(dispute_id)
end

When("I retrieve dispute with ID {string}") do |dispute_id|
  @response = DisputeApiHelper.get_dispute(dispute_id)
end

When("I submit a dispute response with evidence:") do |table|
  dispute_id = @last_dispute["dispute_id"]
  evidence = table.rows_hash.transform_keys(&:to_sym)
  @response = DisputeApiHelper.respond_to_dispute(dispute_id, evidence)
end

When("I attempt to submit a dispute response") do
  dispute_id = @last_dispute["dispute_id"]
  @response = DisputeApiHelper.respond_to_dispute(
    dispute_id,
    type: "rebuttal",
    description: "Late response attempt"
  )
end

When("I submit a dispute response with type {string}") do |response_type|
  dispute_id = @last_dispute["dispute_id"]
  @response = DisputeApiHelper.respond_to_dispute(
    dispute_id,
    type: response_type,
    description: "Counter-claim submission"
  )
end

When("I list all disputes") do
  @response = DisputeApiHelper.list_disputes(merchant_id: @current_merchant_id)
  @dispute_list = parse_json(@response.body) if @response.status == 200
end

# Given steps for dispute state setup

Given("a dispute has been opened against payment {string}") do |payment_id|
  @last_dispute = DisputeTestHelper.open_dispute_for_payment(payment_id)
end

Given("a dispute exists with status {string} and {int} days remaining") do |status, days_remaining|
  @last_dispute = DisputeTestHelper.create_dispute_with_deadline(
    status: status,
    days_remaining: days_remaining,
    merchant_id: @current_merchant_id
  )
end

Given("a dispute exists with status {string} and the response window has expired") do |status|
  @last_dispute = DisputeTestHelper.create_dispute_with_deadline(
    status: status,
    days_remaining: -1,
    merchant_id: @current_merchant_id
  )
end

Given("a dispute exists with status {string}") do |status|
  @last_dispute = DisputeTestHelper.create_dispute(
    status: status,
    merchant_id: @current_merchant_id
  )
end

Given("{int} open disputes exist for my account") do |count|
  @created_disputes = DisputeTestHelper.create_multiple_disputes(
    count,
    status: "open",
    merchant_id: @current_merchant_id
  )
end

# Then steps for dispute assertions

Then("the dispute status should be {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("the dispute reason should be present") do
  body = parse_json(@response.body)
  expect(body["reason"]).not_to be_nil
  expect(body["reason"]).not_to be_empty
end

Then("the response deadline should be within 7 days") do
  body = parse_json(@response.body)
  deadline = Time.parse(body["response_deadline"])
  expect(deadline).to be > Time.now
  expect(deadline).to be < Time.now + (7 * 24 * 60 * 60)
end

Then("the response should contain the open disputes") do
  body = parse_json(@response.body)
  expect(body["data"]).not_to be_empty
  body["data"].each do |dispute|
    expect(dispute["status"]).to eq("open")
  end
end
