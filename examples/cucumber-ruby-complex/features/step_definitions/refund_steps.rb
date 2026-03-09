# frozen_string_literal: true

# refund_steps.rb - Step definitions for refund processing scenarios
# Resolution chain: Feature file -> step def -> RefundApiHelper -> PathConstants -> HTTP call

When("I create a full refund for the payment") do
  payment_id = @last_payment["payment_id"]
  @response = RefundApiHelper.create_refund(
    payment_id: payment_id,
    amount: @last_payment["amount"]
  )
  @last_refund = parse_json(@response.body) if @response.status == 201
end

When("I create a refund for ${float} with reason {string}") do |amount, reason|
  payment_id = @last_payment["payment_id"]
  @response = RefundApiHelper.create_refund(
    payment_id: payment_id,
    amount: amount,
    reason: reason
  )
  @last_refund = parse_json(@response.body) if @response.status == 201
end

When("I create a refund for ${float}") do |amount|
  payment_id = @last_payment["payment_id"]
  @response = RefundApiHelper.create_refund(
    payment_id: payment_id,
    amount: amount
  )
  @last_refund = parse_json(@response.body) if @response.status == 201
end

When("I create a refund for ${float} with the following metadata:") do |amount, table|
  payment_id = @last_payment["payment_id"]
  metadata = table.rows_hash
  @response = RefundApiHelper.create_refund(
    payment_id: payment_id,
    amount: amount,
    metadata: metadata
  )
  @last_refund = parse_json(@response.body) if @response.status == 201
end

When("I retrieve the refund by ID") do
  refund_id = @last_refund["refund_id"]
  @response = RefundApiHelper.get_refund(refund_id)
end

When("I retrieve refund with ID {string}") do |refund_id|
  @response = RefundApiHelper.get_refund(refund_id)
end

When("I attempt to create a refund for the payment") do
  payment_id = @last_payment["payment_id"]
  @response = RefundApiHelper.create_refund(
    payment_id: payment_id,
    amount: @last_payment["amount"]
  )
end

# Given steps for refund state setup

Given("a refund exists for a captured payment") do
  captured = PaymentTestHelper.create_payment_with_status("captured", amount: 100.00, merchant_id: @current_merchant_id)
  result = RefundApiHelper.create_refund(payment_id: captured["payment_id"], amount: 50.00)
  @last_refund = parse_json(result.body)
  @last_payment = captured
end

Given("a refund of ${float} has already been processed") do |refund_amount|
  payment_id = @last_payment["payment_id"]
  RefundApiHelper.create_refund(payment_id: payment_id, amount: refund_amount)
end

# Then steps for refund assertions

Then("the refund status should be {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("the refund amount should be {string}") do |expected_amount|
  body = parse_json(@response.body)
  expect(body["amount"].to_s).to eq(expected_amount)
end

Then("the refund ID should be returned") do
  body = parse_json(@response.body)
  expect(body["refund_id"]).not_to be_nil
  expect(body["refund_id"]).to match(/^REF-[A-Z0-9]+$/)
end

Then("the total refunded amount should be {string}") do |expected_total|
  payment_id = @last_payment["payment_id"]
  payment = parse_json(PaymentApiHelper.get_payment(payment_id).body)
  expect(payment["total_refunded"].to_s).to eq(expected_total)
end

Then("the refund details should be returned") do
  body = parse_json(@response.body)
  expect(body).to have_key("refund_id")
  expect(body).to have_key("amount")
  expect(body).to have_key("status")
  expect(body).to have_key("payment_id")
end

Then("the refund metadata should be stored") do
  refund_id = @last_refund["refund_id"]
  retrieved = parse_json(RefundApiHelper.get_refund(refund_id).body)
  expect(retrieved["metadata"]).not_to be_nil
  expect(retrieved["metadata"]).not_to be_empty
end
