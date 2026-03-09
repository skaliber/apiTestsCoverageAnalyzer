# frozen_string_literal: true

# common_steps.rb - Shared step definitions used across multiple feature files
# These steps handle authentication, common assertions, and cross-cutting concerns.

# ─── Authentication Steps ──────────────────────────────────────────────────────

Given("I am authenticated as a merchant") do
  @current_merchant_id = TestEnvironment.current_merchant_id
  @auth_headers = AuthHelper.merchant_auth_headers(@current_merchant_id)
  ApiClient.configure(headers: @auth_headers)
end

Given("I am authenticated as an admin") do
  @current_merchant_id = TestEnvironment.admin_merchant_id
  @auth_headers = AuthHelper.admin_auth_headers
  ApiClient.configure(headers: @auth_headers)
end

Given("I am not authenticated") do
  ApiClient.configure(headers: {})
end

Given("I am authenticated with a read-only API key") do
  @current_merchant_id = TestEnvironment.current_merchant_id
  @auth_headers = AuthHelper.readonly_auth_headers(@current_merchant_id)
  ApiClient.configure(headers: @auth_headers)
end

Given("I am authenticated as a regular merchant") do
  @current_merchant_id = TestEnvironment.current_merchant_id
  @auth_headers = AuthHelper.merchant_auth_headers(@current_merchant_id)
  ApiClient.configure(headers: @auth_headers)
end

Given("I have an expired API key") do
  @auth_headers = AuthHelper.expired_auth_headers
  ApiClient.configure(headers: @auth_headers)
end

# ─── Service Availability Steps ───────────────────────────────────────────────

Given("the payment service is available") do
  response = AdminApiHelper.health_check
  expect(response.status).to eq(200)
  health = parse_json(response.body)
  expect(health["status"]).to eq("healthy")
end

# ─── Status Assertion Steps ───────────────────────────────────────────────────

Then("the response status should be {int}") do |expected_status|
  expect(@response.status).to eq(expected_status)
end

Then("I should receive a {int} conflict response") do |status_code|
  expect(@response.status).to eq(status_code)
end

# ─── Error Assertion Steps ────────────────────────────────────────────────────

Then("the error code should be {string}") do |expected_code|
  body = parse_json(@response.body)
  expect(body["error_code"]).to eq(expected_code)
end

Then("the error message should contain {string}") do |expected_text|
  body = parse_json(@response.body)
  expect(body["message"].downcase).to include(expected_text.downcase)
end

Then("the error response should contain {string}") do |expected_key|
  body = parse_json(@response.body)
  expect(body).to have_key(expected_key)
end

Then("the error details should identify {string} as the missing field") do |field_name|
  body = parse_json(@response.body)
  errors = body["errors"] || body["details"] || []
  field_errors = errors.select { |e| e["field"] == field_name }
  expect(field_errors).not_to be_empty
end

# ─── Response Body Steps ──────────────────────────────────────────────────────

Then("the response body should contain {string}") do |expected_key|
  body = parse_json(@response.body)
  expect(body).to have_key(expected_key)
end

Then("the response should include a {string} header") do |header_name|
  expect(@response.headers.keys.map(&:downcase)).to include(header_name.downcase)
end

# ─── Admin Steps ──────────────────────────────────────────────────────────────

When("I check the API health status") do
  @response = AdminApiHelper.health_check
end

When("I retrieve the admin statistics") do
  @response = AdminApiHelper.get_stats
end

When("I attempt to access the admin statistics endpoint") do
  @response = AdminApiHelper.get_stats
end

Then("the health status should be {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("the statistics should include total payments processed") do
  body = parse_json(@response.body)
  expect(body).to have_key("total_payments_processed")
end

# ─── Rate Limiting Steps ──────────────────────────────────────────────────────

When("I send {int} payment creation requests within one minute") do |count|
  @responses = []
  count.times do |i|
    @responses << PaymentApiHelper.create_payment(
      amount: 1.00,
      currency: "USD",
      order_id: "ORD-RATELIMIT-#{i}"
    )
  end
  @response = @responses.last
end

Then("the {int}st request should receive status {int}") do |_nth, status_code|
  expect(@responses.last.status).to eq(status_code)
end

# ─── Helper Methods ───────────────────────────────────────────────────────────

def parse_json(body)
  return {} if body.nil? || body.empty?

  JSON.parse(body)
rescue JSON::ParserError => e
  raise "Failed to parse response body as JSON: #{e.message}\nBody: #{body}"
end
