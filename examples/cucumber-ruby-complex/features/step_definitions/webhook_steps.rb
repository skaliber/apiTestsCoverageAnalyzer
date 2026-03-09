# frozen_string_literal: true

# webhook_steps.rb - Step definitions for webhook management scenarios
# Resolution chain: Feature file -> step def -> WebhookApiHelper -> PathConstants -> HTTP call

When("I register a webhook for {string} listening to {string}") do |url, event_type|
  @response = WebhookApiHelper.create_webhook(
    url: url,
    events: [event_type],
    merchant_id: @current_merchant_id
  )
  @last_webhook = parse_json(@response.body) if @response.status == 201
end

When("I register a webhook with the following configuration:") do |table|
  config = table.rows_hash
  events = config["events"].split(",").map(&:strip)
  @response = WebhookApiHelper.create_webhook(
    url: config["url"],
    events: events,
    merchant_id: @current_merchant_id
  )
  @last_webhook = parse_json(@response.body) if @response.status == 201
end

When("a payment is captured") do
  payment_id = @last_payment["payment_id"]
  @response = PaymentApiHelper.capture_payment(payment_id)
  @captured_payment = parse_json(@response.body) if @response.status == 200
end

When("I attempt to process the webhook") do
  @webhook_valid = WebhookValidator.validate(
    payload: @incoming_webhook_payload,
    signature: @incoming_webhook_signature,
    secret: @webhook_secret
  )
end

When("I rotate the webhook secret") do
  webhook_id = @last_webhook["webhook_id"]
  @response = WebhookApiHelper.rotate_secret(webhook_id)
  @new_secret = parse_json(@response.body)["secret"] if @response.status == 200
end

When("I validate the webhook signature against the received payload") do
  @webhook_valid = WebhookValidator.validate(
    payload: @tampered_payload,
    signature: @original_signature,
    secret: @webhook_secret
  )
end

# Given steps for webhook state setup

Given("a webhook endpoint is registered for {string}") do |event_type|
  result = WebhookApiHelper.create_webhook(
    url: "https://test.example.com/webhooks",
    events: [event_type],
    merchant_id: @current_merchant_id
  )
  @last_webhook = parse_json(result.body)
  @webhook_secret = @last_webhook["secret"]
end

Given("a webhook endpoint exists") do
  result = WebhookApiHelper.create_webhook(
    url: "https://test.example.com/webhooks",
    events: ["payment.captured"],
    merchant_id: @current_merchant_id
  )
  @last_webhook = parse_json(result.body)
  @webhook_secret = @last_webhook["secret"]
end

Given("a webhook is received with an invalid HMAC signature") do
  @incoming_webhook_payload = '{"event":"payment.captured","payment_id":"PAY-TEST-001"}'
  @incoming_webhook_signature = "sha256=invalidsignature12345"
  @webhook_secret = "real-secret-that-doesnt-match"
end

Given("a webhook arrives without a signature header") do
  @incoming_webhook_payload = '{"event":"payment.captured","payment_id":"PAY-TEST-002"}'
  @incoming_webhook_signature = nil
end

Given("a webhook arrives with a valid signature for a different payload") do
  @original_payload = '{"event":"payment.captured","payment_id":"PAY-ORIGINAL"}'
  @tampered_payload = '{"event":"payment.captured","payment_id":"PAY-TAMPERED"}'
  @webhook_secret = "test-webhook-secret"
  @original_signature = WebhookValidator.generate_signature(@original_payload, @webhook_secret)
end

# Then steps for webhook assertions

Then("the webhook should be created with status {string}") do |expected_status|
  body = parse_json(@response.body)
  expect(body["status"]).to eq(expected_status)
end

Then("a webhook secret should be provided for signature validation") do
  body = parse_json(@response.body)
  expect(body["secret"]).not_to be_nil
  expect(body["secret"].length).to be >= 32
end

Then("the webhook should be subscribed to {int} event types") do |count|
  body = parse_json(@response.body)
  expect(body["events"].length).to eq(count)
end

Then("the webhook should be delivered to my endpoint") do
  expect(@last_webhook).not_to be_nil
  deliveries = WebhookTestHelper.get_deliveries_for_webhook(@last_webhook["webhook_id"])
  expect(deliveries).not_to be_empty
end

Then("the webhook payload should include an HMAC-SHA256 signature") do
  deliveries = WebhookTestHelper.get_deliveries_for_webhook(@last_webhook["webhook_id"])
  latest = deliveries.first
  expect(latest["headers"]["X-Webhook-Signature"]).to match(/^sha256=/)
end

Then("the signature should be valid for the payload") do
  deliveries = WebhookTestHelper.get_deliveries_for_webhook(@last_webhook["webhook_id"])
  latest = deliveries.first
  valid = WebhookValidator.validate(
    payload: latest["body"],
    signature: latest["headers"]["X-Webhook-Signature"],
    secret: @webhook_secret
  )
  expect(valid).to be true
end

Then("the signature validation should fail") do
  expect(@webhook_valid).to be false
end

Then("the webhook should be rejected with status {int}") do |status_code|
  expect(@response.status).to eq(status_code)
end

Then("the webhook should not be processed") do
  expect(@webhook_valid).to be false
end

Then("a new secret should be issued") do
  expect(@new_secret).not_to be_nil
  expect(@new_secret).not_to eq(@webhook_secret)
end

Then("the old secret should be invalidated") do
  valid = WebhookValidator.validate(
    payload: '{"test":"payload"}',
    signature: WebhookValidator.generate_signature('{"test":"payload"}', @webhook_secret),
    secret: @new_secret
  )
  expect(valid).to be false
end

Then("the error message should indicate missing signature") do
  body = parse_json(@response.body)
  expect(body["message"]).to include("signature")
end
