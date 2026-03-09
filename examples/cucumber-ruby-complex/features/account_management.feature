@account_management
Feature: Account Management
  As a merchant
  I want to manage my payment processing account
  So that I can control payment limits and view my balance

  Background:
    Given I am authenticated as a merchant

  @smoke @retrieve
  Scenario: Retrieve account details
    When I retrieve my account information
    Then the response status should be 200
    And the response should include account status "active"
    And the response should include my merchant ID

  @balance
  Scenario: Check account balance
    Given my account has a balance of $1000.00
    When I check my account balance
    Then the response status should be 200
    And the balance should be "1000.00"
    And the currency should be "USD"

  @balance
  Scenario: Balance reflects recent transactions
    Given my account has a balance of $500.00
    And a captured payment of $200.00 has been processed
    When I check my account balance
    Then the response status should be 200
    And the available balance should reflect the new transaction

  @limits
  Scenario: Update transaction limits
    When I update my account limits with:
      | daily_limit       | 50000.00 |
      | per_transaction   | 5000.00  |
      | monthly_limit     | 500000.00|
    Then the response status should be 200
    And the limits should be updated successfully

  @limits @negative
  Scenario: Cannot set limits above platform maximum
    When I update my per-transaction limit to $1000000.00
    Then the response status should be 422
    And the error code should be "LIMIT_EXCEEDS_MAXIMUM"

  @business_rules
  Scenario: Verify account must be active for payments
    Given my merchant account status is "suspended"
    When I retrieve my account information
    Then the response status should be 200
    And the account status should be "suspended"
    And payments should not be accepted

  @retrieve @negative
  Scenario: Cannot access another merchant's account
    Given another merchant account exists with ID "MERCH-99999"
    When I attempt to retrieve account "MERCH-99999"
    Then the response status should be 403
    And the error code should be "ACCESS_DENIED"
