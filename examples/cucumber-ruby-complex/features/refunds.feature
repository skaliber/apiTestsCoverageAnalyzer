@refunds
Feature: Refund Processing
  As a merchant
  I want to process refunds for captured payments
  So that I can return funds to customers when needed

  Background:
    Given I am authenticated as a merchant
    And the payment service is available

  @smoke @create
  Scenario: Full refund of a captured payment
    Given a payment exists with status "captured" and amount $150.00
    When I create a full refund for the payment
    Then the response status should be 201
    And the refund status should be "pending"
    And the refund amount should be "150.00"
    And the refund ID should be returned

  @create
  Scenario: Partial refund of a captured payment
    Given a payment exists with status "captured" and amount $200.00
    When I create a refund for $75.00 with reason "customer_request"
    Then the response status should be 201
    And the refund status should be "pending"
    And the refund amount should be "75.00"

  @create
  Scenario: Multiple partial refunds up to the original amount
    Given a payment exists with status "captured" and amount $300.00
    And a refund of $100.00 has already been processed
    When I create a refund for $200.00
    Then the response status should be 201
    And the total refunded amount should be "300.00"

  @retrieve
  Scenario: Retrieve a specific refund
    Given a refund exists for a captured payment
    When I retrieve the refund by ID
    Then the response status should be 200
    And the refund details should be returned

  @negative @business_rules
  Scenario: Cannot refund an authorized (uncaptured) payment
    Given a payment exists with status "authorized"
    When I attempt to create a refund for the payment
    Then the response status should be 422
    And the error code should be "REFUND_NOT_ALLOWED"
    And the error message should contain "only captured payments can be refunded"

  @negative @business_rules
  Scenario: Refund amount cannot exceed original payment
    Given a payment exists with status "captured" and amount $100.00
    When I create a refund for $150.00
    Then the response status should be 422
    And the error code should be "REFUND_EXCEEDS_ORIGINAL"
    And the error message should contain "refund amount exceeds original payment"

  @negative @business_rules
  Scenario: Cannot refund more than remaining balance
    Given a payment exists with status "captured" and amount $100.00
    And a refund of $80.00 has already been processed
    When I create a refund for $50.00
    Then the response status should be 422
    And the error code should be "REFUND_EXCEEDS_REMAINING"

  @negative
  Scenario: Cannot refund a voided payment
    Given a payment exists with status "voided"
    When I attempt to create a refund for the payment
    Then the response status should be 422
    And the error code should be "REFUND_NOT_ALLOWED"

  Scenario: Refund with metadata
    Given a payment exists with status "captured" and amount $500.00
    When I create a refund for $500.00 with the following metadata:
      | reason       | product_defect              |
      | notes        | Customer reported defect    |
      | requested_by | support_agent_42            |
    Then the response status should be 201
    And the refund metadata should be stored
