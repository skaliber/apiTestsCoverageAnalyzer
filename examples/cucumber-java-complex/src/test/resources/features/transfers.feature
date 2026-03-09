Feature: Fund Transfers
  As a banking customer
  I want to transfer money between accounts and to beneficiaries
  So that I can send money to others

  Background:
    Given I am authenticated with valid credentials

  Scenario: Transfer money to a verified beneficiary
    Given I have a checking account with balance $2000
    And a verified beneficiary with account "EXT-ACC-999"
    When I transfer $500 to the beneficiary
    Then the transfer should be initiated successfully
    And the transfer status should be "PENDING"

  Scenario: Check transfer status after initiation
    Given I have a checking account with balance $1000
    And a verified beneficiary with account "EXT-ACC-888"
    When I transfer $200 to the beneficiary
    And I retrieve the transfer status
    Then I should see the transfer status

  Scenario: Reject transfer to unverified beneficiary
    Given I have a checking account with balance $1000
    And an unverified beneficiary exists
    When I attempt to transfer $100 to the unverified beneficiary
    Then the transfer should be rejected due to unverified beneficiary

  Scenario: Reject transfer exceeding daily limit
    Given I have a checking account with balance $100000
    And a verified beneficiary with account "EXT-ACC-777"
    When I transfer $60000 exceeding the daily limit
    Then the transfer should be rejected for exceeding daily limit

  Scenario: International wire transfer
    Given I have a checking account with balance $50000
    And a verified beneficiary with account "DE89370400440532013000"
    When I transfer $5000 as an international wire
    Then the transfer should be initiated successfully

  Scenario: View list of beneficiaries
    Given I have a checking account with balance $100
    And a verified beneficiary with account "EXT-ACC-555"
    When I view my list of beneficiaries
    Then the beneficiary list should not be empty

  Scenario: Add a new beneficiary
    When I view my list of beneficiaries
    Then the beneficiary list should not be empty
