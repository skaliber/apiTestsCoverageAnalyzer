@error_scenarios
Feature: API Error Handling
  As a developer integrating with the payment API
  I want consistent and informative error responses
  So that I can handle failures gracefully in my application

  Background:
    Given I am authenticated as a merchant

  @validation
  Scenario: Missing required field returns 400
    When I create a payment without specifying an amount
    Then the response status should be 400
    And the error code should be "VALIDATION_ERROR"
    And the error details should identify "amount" as the missing field

  @validation
  Scenario: Invalid currency code returns 422
    When I create a payment with currency "XYZ"
    Then the response status should be 422
    And the error code should be "INVALID_CURRENCY"

  @validation
  Scenario: Negative amount is rejected
    When I create a payment of $-50.00 for order "ORD-NEG"
    Then the response status should be 422
    And the error code should be "INVALID_AMOUNT"
    And the error message should contain "amount must be positive"

  @not_found
  Scenario: Retrieving non-existent payment returns 404
    When I retrieve payment with ID "PAY-DOES-NOT-EXIST"
    Then the response status should be 404
    And the error code should be "PAYMENT_NOT_FOUND"

  @not_found
  Scenario: Retrieving non-existent refund returns 404
    When I retrieve refund with ID "REF-DOES-NOT-EXIST"
    Then the response status should be 404
    And the error code should be "REFUND_NOT_FOUND"

  @not_found
  Scenario: Retrieving non-existent dispute returns 404
    When I retrieve dispute with ID "DSP-DOES-NOT-EXIST"
    Then the response status should be 404
    And the error code should be "DISPUTE_NOT_FOUND"

  @not_found
  Scenario: Capturing non-existent payment returns 404
    When I attempt to capture payment with ID "PAY-GHOST-001"
    Then the response status should be 404
    And the error code should be "PAYMENT_NOT_FOUND"

  @state_machine
  Scenario: Cannot capture an already captured payment
    Given a payment exists with status "captured"
    When I attempt to capture the payment again
    Then the response status should be 422
    And the error code should be "INVALID_STATE_TRANSITION"
    And the error message should indicate the payment is already captured

  @state_machine
  Scenario: Cannot void a refunded payment
    Given a payment exists with status "refunded"
    When I attempt to void the payment
    Then the response status should be 422
    And the error code should be "INVALID_STATE_TRANSITION"

  @error_format
  Scenario: All errors follow the standard error schema
    When I create a payment without specifying an amount
    Then the error response should contain "error_code"
    And the error response should contain "message"
    And the error response should contain "request_id"
    And the error response should contain "timestamp"

  @timeout
  Scenario: Downstream timeout returns 503
    Given the card network is experiencing delays
    When I create a payment that triggers a downstream timeout
    Then the response status should be 503
    And the error code should be "SERVICE_UNAVAILABLE"
    And the response should include a "Retry-After" header
