@disputes
Feature: Dispute Resolution
  As a merchant
  I want to manage payment disputes
  So that I can respond to chargebacks and protect my revenue

  Background:
    Given I am authenticated as a merchant

  @smoke @create
  Scenario: View an open dispute
    Given a dispute has been opened against payment "PAY-123456"
    When I retrieve the dispute details
    Then the response status should be 200
    And the dispute status should be "open"
    And the dispute reason should be present
    And the response deadline should be within 7 days

  @respond @business_rules
  Scenario: Respond to a dispute within the time window
    Given a dispute exists with status "open" and 5 days remaining
    When I submit a dispute response with evidence:
      | type        | merchant_order_proof       |
      | description | Customer confirmed receipt  |
      | file_urls   | https://cdn.example.com/r1 |
    Then the response status should be 200
    And the dispute status should be "under_review"

  @respond @business_rules @negative
  Scenario: Cannot respond to an expired dispute
    Given a dispute exists with status "open" and the response window has expired
    When I attempt to submit a dispute response
    Then the response status should be 422
    And the error code should be "DISPUTE_WINDOW_EXPIRED"
    And the error message should contain "response window of 7 days has passed"

  @respond @negative
  Scenario: Cannot respond to an already-resolved dispute
    Given a dispute exists with status "won"
    When I attempt to submit a dispute response
    Then the response status should be 422
    And the error code should be "DISPUTE_ALREADY_RESOLVED"

  @list
  Scenario: List open disputes
    Given 3 open disputes exist for my account
    When I list all disputes
    Then the response status should be 200
    And the response should contain the open disputes

  Scenario: Create a dispute counter-claim
    Given a dispute exists with status "open"
    When I submit a dispute response with type "full_counter_claim"
    Then the response status should be 200
    And the dispute status should be "disputed"

  @business_rules
  Scenario: Dispute affects payment status
    Given a dispute has been opened against a captured payment
    When I retrieve the original payment
    Then the payment status should include "disputed" flag
    And funds should be placed on hold
