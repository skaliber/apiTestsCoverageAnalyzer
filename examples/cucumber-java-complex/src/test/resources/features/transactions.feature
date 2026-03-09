Feature: Transactions
  As a banking customer
  I want to perform financial transactions
  So that I can manage money movements on my accounts

  Background:
    Given I am authenticated with valid credentials

  Scenario: Deposit money into a checking account
    Given I have a checking account with balance $500
    When I make a deposit of $250 to the account
    Then the transaction should be recorded successfully
    And the transaction type should be "DEPOSIT"

  Scenario: Withdraw money from a checking account
    Given I have a checking account with balance $1000
    When I make a withdrawal of $300 from the account
    Then the transaction should be recorded successfully
    And the transaction type should be "WITHDRAWAL"

  Scenario: View transaction history
    Given I have a checking account with balance $1000
    When I make a deposit of $100 to the account
    And I make a withdrawal of $50 from the account
    And I retrieve the transaction history for the account
    Then the transaction history should not be empty

  Scenario: Get individual transaction details
    Given I have a checking account with balance $500
    When I make a deposit of $100 to the account
    And I retrieve details of the last transaction
    Then I should see the transaction details

  Scenario: Prevent overdraft - balance cannot go below zero
    Given I have a checking account with balance $100
    When I make a withdrawal of $200 from the account
    Then I should receive a 422 error
    And the error should mention insufficient funds

  Scenario: Cannot withdraw from dormant account
    Given I am authenticated with valid credentials
    And an account exists with id "ACC-DORMANT-001"
    When I try to withdraw $50 from a dormant account
    Then I should receive a 422 error
