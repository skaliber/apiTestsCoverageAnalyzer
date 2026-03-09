Feature: Account Management
  As a banking customer
  I want to manage my bank accounts
  So that I can control my finances

  Background:
    Given I am authenticated with valid credentials

  Scenario: Create a new checking account
    When I create a checking account with initial deposit of $100
    Then the account should be created successfully
    And the account balance should be $100
    And the response should include an account id

  Scenario: Create a savings account with minimum balance requirement
    When I create a savings account with minimum balance of $500
    Then the account should be created successfully
    And the account balance should be $500

  Scenario: Get account details
    Given an account exists with id "ACC-001"
    When I retrieve the account details
    Then I should see the account information

  Scenario: Update account display name
    Given I have a checking account with balance $200
    When I update the account with a new display name "My Main Account"
    Then I should see the account information

  Scenario: Check account balance
    Given I have a checking account with balance $750.50
    When I check the account balance
    Then the balance response should show $750.50

  Scenario: Request account statement
    Given I have a checking account with balance $1000
    When I make a deposit of $500 to the account
    And I request the account statement
    Then the statement should contain transaction entries

  Scenario: List all accounts
    Given I have a checking account with balance $100
    When I list all accounts
    Then I should see the account information

  Scenario: Close an account
    Given I have a checking account with balance $0
    When I close the account
    Then the account should no longer exist

  Scenario: Unauthorized access attempt
    Given I am not authenticated
    When I try to access account "ACC-001"
    Then I should receive a 401 unauthorized response
