Feature: Error Scenarios
  As a banking customer
  I want the API to return meaningful error messages
  So that I can understand why operations fail

  Background:
    Given I am authenticated with valid credentials

  Scenario: Request non-existent account returns 404
    Given an account exists with id "DOES-NOT-EXIST"
    When I retrieve the account details
    Then I should receive a 404 not found response

  Scenario: Create account with negative initial deposit
    When I create a checking account with initial deposit of $-100
    Then I should receive a 400 bad request response
    And the error should describe the invalid field

  Scenario: Withdraw more than account balance
    Given I have a checking account with balance $100
    When I make a withdrawal of $200 from the account
    Then I should receive a 422 error
    And the error should mention insufficient funds

  Scenario: Apply for loan with missing required fields
    When I apply for a personal loan of $0 with term 0 months
    Then I should receive a 400 bad request response

  Scenario: Transfer to non-existent beneficiary
    Given I have a checking account with balance $500
    When I attempt to transfer $100 to the unverified beneficiary
    Then I should receive a 422 error

  Scenario: Savings account cannot go below minimum balance
    Given I am authenticated with valid credentials
    And an account exists with id "SAV-MIN-TEST"
    When I make a withdrawal of $1000 from the account
    Then I should receive a 422 error

  Scenario: Request statement for non-existent account
    When I retrieve the official statement for account "GHOST-ACCOUNT"
    Then I should receive a 404 not found response
