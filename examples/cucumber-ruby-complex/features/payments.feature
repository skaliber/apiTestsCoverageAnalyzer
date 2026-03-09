@payments
Feature: Payment Processing
  As a merchant
  I want to process payments through the API
  So that I can accept payments from customers

  Background:
    Given I am authenticated as a merchant
    And the payment service is available

  @smoke @create
  Scenario: Successful payment authorization
    When I create a payment of $100.00 for order "ORD-001"
    Then the response status should be 201
    And the payment status should be "authorized"
    And the payment ID should be returned
    And the response should include the amount "100.00"

  @smoke @create
  Scenario: Payment creation with full details
    When I create a payment with the following details:
      | amount   | 250.00    |
      | currency | USD        |
      | order_id | ORD-002   |
      | customer | CUST-9876 |
    Then the response status should be 201
    And the payment status should be "authorized"
    And the response body should contain "payment_id"

  @capture
  Scenario: Successful payment capture
    Given a payment exists with status "authorized"
    When I capture the payment
    Then the response status should be 200
    And the payment status should be "captured"
    And the captured amount should match the authorized amount

  @capture
  Scenario: Partial payment capture
    Given a payment exists with authorized amount of $500.00
    When I capture the payment for $300.00
    Then the response status should be 200
    And the payment status should be "captured"
    And the captured amount should be "300.00"

  @void
  Scenario: Void an authorized payment
    Given a payment exists with status "authorized"
    When I void the payment
    Then the response status should be 200
    And the payment status should be "voided"

  @void @negative
  Scenario: Cannot void a captured payment
    Given a payment exists with status "captured"
    When I void the payment
    Then the response status should be 422
    And the error code should be "VOID_NOT_ALLOWED"
    And the error message should contain "captured payments cannot be voided"

  @list
  Scenario: List payments with pagination
    Given 5 payments exist for my merchant account
    When I list all payments with page size 3
    Then the response status should be 200
    And the response should contain 3 payments
    And the response should include pagination metadata

  @retrieve
  Scenario: Retrieve a specific payment
    Given a payment exists with status "authorized"
    When I retrieve the payment by ID
    Then the response status should be 200
    And the payment details should match the created payment

  @idempotency @negative
  Scenario: Duplicate payment prevention via idempotency key
    Given I have already created a payment with idempotency key "idem-key-123"
    When I submit another payment with the same idempotency key "idem-key-123"
    Then the response status should be 409
    And the error code should be "DUPLICATE_PAYMENT"
    And the original payment should be returned

  @negative
  Scenario: Payment creation with invalid card
    When I create a payment with an invalid card number "0000-0000-0000-0000"
    Then the response status should be 422
    And the error code should be "INVALID_CARD"

  @negative
  Scenario: Payment creation with insufficient funds
    When I create a payment of $99999.99 for order "ORD-BIGTICKET"
    Then the response status should be 402
    And the error code should be "INSUFFICIENT_FUNDS"

  @business_rules
  Scenario: Account must be active to accept payments
    Given my merchant account is suspended
    When I create a payment of $100.00 for order "ORD-SUSPENDED"
    Then the response status should be 403
    And the error code should be "ACCOUNT_INACTIVE"
