@webhooks
Feature: Webhook Management
  As a merchant
  I want to configure webhooks
  So that I can receive real-time notifications about payment events

  Background:
    Given I am authenticated as a merchant

  @smoke @create
  Scenario: Register a webhook endpoint
    When I register a webhook for "https://example.com/webhooks" listening to "payment.captured"
    Then the response status should be 201
    And the webhook should be created with status "active"
    And a webhook secret should be provided for signature validation

  @create
  Scenario: Register webhook with multiple event types
    When I register a webhook with the following configuration:
      | url    | https://payments.example.com/notify |
      | events | payment.authorized,payment.captured,payment.voided,refund.created |
    Then the response status should be 201
    And the webhook should be subscribed to 4 event types

  @validate @business_rules
  Scenario: Webhook payload includes HMAC signature
    Given a webhook endpoint is registered for "payment.captured"
    When a payment is captured
    Then the webhook should be delivered to my endpoint
    And the webhook payload should include an HMAC-SHA256 signature
    And the signature should be valid for the payload

  @validate @business_rules
  Scenario: Reject webhook with invalid signature
    Given a webhook is received with an invalid HMAC signature
    When I attempt to process the webhook
    Then the signature validation should fail
    And the webhook should be rejected with status 401

  @negative
  Scenario: Register webhook with invalid URL
    When I register a webhook for "not-a-valid-url" listening to "payment.captured"
    Then the response status should be 422
    And the error code should be "INVALID_WEBHOOK_URL"

  @negative
  Scenario: Register webhook with unknown event type
    When I register a webhook for "https://example.com/wh" listening to "unknown.event"
    Then the response status should be 422
    And the error code should be "UNKNOWN_EVENT_TYPE"

  @security
  Scenario: Webhook secret rotation
    Given a webhook endpoint exists
    When I rotate the webhook secret
    Then a new secret should be issued
    And the old secret should be invalidated
