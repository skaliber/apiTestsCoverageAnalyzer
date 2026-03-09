# frozen_string_literal: true

# account_steps.rb - Step definitions for account management scenarios
# Resolution chain: Feature file -> step def -> AccountApiHelper -> PathConstants -> HTTP call

When("I retrieve my account information") do
  @response = AccountApiHelper.get_account(@current_merchant_id)
end

When("I check my account balance") do
  @response = AccountApiHelper.get_balance(@current_merchant_id)
  @balance_data = parse_json(@response.body) if @response.status == 200
end

When("I update my account limits with:") do |table|
  limits = table.rows_hash.transform_keys(&:to_sym)
  @response = AccountApiHelper.update_limits(@current_merchant_id, limits)
end

When("I update my per-transaction limit to ${float}") do |limit|
  @response = AccountApiHelper.update_limits(@current_merchant_id, per_transaction: limit)
end

When("I attempt to retrieve account {string}") do |account_id|
  @response = AccountApiHelper.get_account(account_id)
end

# Given steps for account state setup

Given("my account has a balance of ${float}") do |amount|
  AccountTestHelper.set_account_balance(@current_merchant_id, amount)
end

Given("my merchant account is suspended") do
  AccountTestHelper.set_account_status(@current_merchant_id, "suspended")
end

Given("my merchant account status is {string}") do |status|
  AccountTestHelper.set_account_status(@current_merchant_id, status)
end

Given("another merchant account exists with ID {string}") do |account_id|
  AccountTestHelper.create_test_account(account_id)
end

# Then steps for account assertions

Then("the response should include account status {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("the response should include my merchant ID") do
  body = parse_json(@response.body)
  expect(body["merchant_id"]).to eq(@current_merchant_id)
end

Then("the balance should be {string}") do |expected_balance|
  body = parse_json(@response.body)
  expect(body["available_balance"].to_s).to eq(expected_balance)
end

Then("the currency should be {string}") do |expected_currency|
  body = parse_json(@response.body)
  expect(body["currency"]).to eq(expected_currency)
end

Then("the available balance should reflect the new transaction") do
  body = parse_json(@response.body)
  expect(body["available_balance"]).not_to be_nil
  expect(body["last_updated"]).not_to be_nil
end

Then("the limits should be updated successfully") do
  body = parse_json(@response.body)
  expect(body["limits"]).not_to be_nil
  expect(body["updated_at"]).not_to be_nil
end

Then("the account status should be {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("payments should not be accepted") do
  payment_response = PaymentApiHelper.create_payment(
    amount: 10.00,
    currency: "USD",
    order_id: "ORD-SUSPENDED-TEST",
    customer_id: @current_merchant_id
  )
  expect(payment_response.status).to eq(403)
end
