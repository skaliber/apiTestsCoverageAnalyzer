@security
Feature: Security Scenarios
  As a platform administrator
  I want to ensure all API endpoints are properly secured
  So that only authorized parties can access sensitive payment data

  @authentication
  Scenario: Unauthenticated request is rejected
    Given I am not authenticated
    When I attempt to create a payment of $50.00 for order "ORD-UNAUTH"
    Then the response status should be 401
    And the error code should be "AUTHENTICATION_REQUIRED"

  @authentication
  Scenario: Expired API key is rejected
    Given I have an expired API key
    When I attempt to retrieve my account information
    Then the response status should be 401
    And the error code should be "API_KEY_EXPIRED"

  @authorization
  Scenario: Read-only key cannot create payments
    Given I am authenticated with a read-only API key
    When I attempt to create a payment of $50.00 for order "ORD-READONLY"
    Then the response status should be 403
    And the error code should be "INSUFFICIENT_PERMISSIONS"

  @authorization
  Scenario: Admin endpoint requires admin key
    Given I am authenticated as a regular merchant
    When I attempt to access the admin statistics endpoint
    Then the response status should be 403
    And the error code should be "ADMIN_ACCESS_REQUIRED"

  @rate_limiting
  Scenario: Rate limiting is enforced on payment creation
    Given I am authenticated as a merchant
    When I send 101 payment creation requests within one minute
    Then the 101st request should receive status 429
    And the error code should be "RATE_LIMIT_EXCEEDED"
    And the response should include a "Retry-After" header

  @webhook_security @business_rules
  Scenario: Webhook signature must be validated
    Given a webhook endpoint is registered
    When a webhook arrives without a signature header
    Then the webhook should be rejected with status 401
    And the error message should indicate missing signature

  @webhook_security @business_rules
  Scenario: Webhook with tampered payload is rejected
    Given a webhook arrives with a valid signature for a different payload
    When I validate the webhook signature against the received payload
    Then the signature validation should fail
    And the webhook should not be processed

  @idempotency
  Scenario: Idempotency prevents double charges
    Given I have successfully created payment "PAY-IDEM-001" with idempotency key "safe-key-456"
    When a network timeout causes a retry with the same idempotency key "safe-key-456"
    Then the response status should be 200
    And the same payment "PAY-IDEM-001" should be returned without a new charge

  @admin
  Scenario: Health check endpoint is accessible
    Given I am authenticated as an admin
    When I check the API health status
    Then the response status should be 200
    And the health status should be "healthy"

  @admin
  Scenario: Admin can view platform statistics
    Given I am authenticated as an admin
    When I retrieve the admin statistics
    Then the response status should be 200
    And the statistics should include total payments processed
