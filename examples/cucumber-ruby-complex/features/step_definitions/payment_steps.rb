# frozen_string_literal: true

# payment_steps.rb - Step definitions for payment processing scenarios
# These steps delegate to PaymentApiHelper which uses PathConstants for URL construction.
# Resolution chain: Feature file -> step def -> PaymentApiHelper -> PathConstants -> HTTP call

When("I create a payment of ${float} for order {string}") do |amount, order_id|
  @response = PaymentApiHelper.create_payment(
    amount: amount,
    currency: "USD",
    order_id: order_id,
    customer_id: @current_merchant_id
  )
  @last_payment = parse_json(@response.body) if @response.status == 201
end

When("I create a payment with the following details:") do |table|
  attrs = table.rows_hash.transform_keys(&:to_sym)
  @response = PaymentApiHelper.create_payment(attrs)
  @last_payment = parse_json(@response.body) if @response.status == 201
end

When("I create a payment with an invalid card number {string}") do |card_number|
  @response = PaymentApiHelper.create_payment(
    amount: 50.00,
    currency: "USD",
    order_id: "ORD-INVCARD",
    card_number: card_number
  )
end

When("I capture the payment") do
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.capture_payment(payment_id)
  @last_payment = parse_json(@response.body) if @response.status == 200
end

When("I capture the payment for ${float}") do |amount|
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.capture_payment(payment_id, amount: amount)
  @last_payment = parse_json(@response.body) if @response.status == 200
end

When("I void the payment") do
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.void_payment(payment_id)
  @last_payment = parse_json(@response.body) if @response.status == 200
end

When("I list all payments with page size {int}") do |page_size|
  @response = PaymentApiHelper.list_payments(page_size: page_size)
  @payment_list = parse_json(@response.body)
end

When("I retrieve the payment by ID") do
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.get_payment(payment_id)
  @retrieved_payment = parse_json(@response.body) if @response.status == 200
end

When("I retrieve payment with ID {string}") do |payment_id|
  @response = PaymentApiHelper.get_payment(payment_id)
end

When("I attempt to capture payment with ID {string}") do |payment_id|
  @response = PaymentApiHelper.capture_payment(payment_id)
end

When("I submit another payment with the same idempotency key {string}") do |idem_key|
  @response = PaymentApiHelper.create_payment(
    amount: 100.00,
    currency: "USD",
    order_id: "ORD-DUP",
    idempotency_key: idem_key
  )
end

When("I attempt to capture the payment again") do
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.capture_payment(payment_id)
end

When("I attempt to void the payment") do
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.void_payment(payment_id)
end

When("a network timeout causes a retry with the same idempotency key {string}") do |idem_key|
  @response = PaymentApiHelper.create_payment(
    amount: 100.00,
    currency: "USD",
    order_id: "ORD-RETRY",
    idempotency_key: idem_key
  )
end

# Given steps for payment state setup

Given("a payment exists with status {string}") do |status|
  @last_payment = PaymentTestHelper.create_payment_with_status(status, merchant_id: @current_merchant_id)
end

Given("a payment exists with status {string} and amount ${float}") do |status, amount|
  @last_payment = PaymentTestHelper.create_payment_with_status(
    status,
    amount: amount,
    merchant_id: @current_merchant_id
  )
end

Given("a payment exists with authorized amount of ${float}") do |amount|
  @last_payment = PaymentTestHelper.create_payment_with_status(
    "authorized",
    amount: amount,
    merchant_id: @current_merchant_id
  )
end

Given("{int} payments exist for my merchant account") do |count|
  @created_payments = PaymentTestHelper.create_multiple_payments(count, merchant_id: @current_merchant_id)
end

Given("I have already created a payment with idempotency key {string}") do |idem_key|
  @original_payment = PaymentTestHelper.create_payment_with_idempotency_key(idem_key, merchant_id: @current_merchant_id)
  @last_payment = @original_payment
end

Given("I have successfully created payment {string} with idempotency key {string}") do |payment_id, idem_key|
  @original_payment = PaymentTestHelper.create_payment_with_id_and_key(payment_id, idem_key, merchant_id: @current_merchant_id)
  @last_payment = @original_payment
end

Given("a captured payment of ${float} has been processed") do |amount|
  PaymentTestHelper.create_payment_with_status("captured", amount: amount, merchant_id: @current_merchant_id)
end

Given("a dispute has been opened against a captured payment") do
  captured = PaymentTestHelper.create_payment_with_status("captured", merchant_id: @current_merchant_id)
  @last_dispute = DisputeTestHelper.open_dispute_for_payment(captured["payment_id"])
  @last_payment = PaymentApiHelper.get_payment(captured["payment_id"]).tap { |r| @response = r }
  @last_payment_data = parse_json(@last_payment.body) if @last_payment.status == 200
end

Given("the card network is experiencing delays") do
  TestEnvironment.simulate_downstream_timeout(true)
end

Given("a payment that triggers a downstream timeout") do
  @response = PaymentApiHelper.create_payment(
    amount: 100.00,
    currency: "USD",
    order_id: "ORD-TIMEOUT",
    simulate_timeout: true
  )
end

# Then steps for payment assertions

Then("the payment status should be {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("the payment ID should be returned") do
  body = parse_json(@response.body)
  expect(body["payment_id"]).not_to be_nil
  expect(body["payment_id"]).to match(/^PAY-[A-Z0-9]+$/)
end

Then("the response should include the amount {string}") do |expected_amount|
  body = parse_json(@response.body)
  expect(body["amount"].to_s).to eq(expected_amount)
end

Then("the captured amount should match the authorized amount") do
  body = parse_json(@response.body)
  expect(body["captured_amount"]).to eq(body["authorized_amount"])
end

Then("the captured amount should be {string}") do |expected_amount|
  body = parse_json(@response.body)
  expect(body["captured_amount"].to_s).to eq(expected_amount)
end

Then("the response should contain {int} payments") do |count|
  body = parse_json(@response.body)
  expect(body["data"].length).to eq(count)
end

Then("the response should include pagination metadata") do
  body = parse_json(@response.body)
  expect(body).to have_key("pagination")
  expect(body["pagination"]).to have_key("total")
  expect(body["pagination"]).to have_key("page")
  expect(body["pagination"]).to have_key("per_page")
end

Then("the payment details should match the created payment") do
  original = @last_payment
  retrieved = parse_json(@response.body)
  expect(retrieved["payment_id"]).to eq(original["payment_id"])
  expect(retrieved["amount"]).to eq(original["amount"])
end

Then("the original payment should be returned") do
  body = parse_json(@response.body)
  expect(body["payment_id"]).to eq(@original_payment["payment_id"])
end

Then("the same payment {string} should be returned without a new charge") do |payment_id|
  body = parse_json(@response.body)
  expect(body["payment_id"]).to eq(payment_id)
end

Then("the payment status should include {string} flag") do |flag|
  body = parse_json(@response.body)
  expect(body["flags"]).to include(flag)
end

Then("funds should be placed on hold") do
  body = parse_json(@response.body)
  expect(body["funds_on_hold"]).to be true
end
