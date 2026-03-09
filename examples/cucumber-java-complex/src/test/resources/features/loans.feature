Feature: Loan Management
  As a banking customer
  I want to apply for and manage loans
  So that I can access financing for my needs

  Background:
    Given I am authenticated with valid credentials

  Scenario: Apply for a personal loan with good credit
    Given a customer with credit score 750
    When I apply for a personal loan of $10000 with term 24 months
    Then the loan application should be approved
    And the response should include an account id

  Scenario: Reject loan application for poor credit score
    Given a customer with credit score 450
    When I try to apply for a loan with credit score below minimum
    Then the loan application should be rejected

  Scenario: Retrieve loan details
    Given an approved loan exists with id "LOAN-001"
    When I retrieve the loan details
    Then I should see the loan details

  Scenario: Make a scheduled loan payment
    Given a customer with credit score 720
    And I apply for a personal loan of $5000 with term 12 months
    When I make a loan payment of $450
    Then the loan payment should be accepted
    And the remaining balance should decrease

  Scenario: Reject off-schedule loan payment
    Given an approved loan exists with id "LOAN-SCHEDULE-001"
    When I make a loan payment that does not match the amortization schedule
    Then the payment should be rejected with a schedule mismatch error

  Scenario: Apply for a mortgage
    Given a customer with credit score 800
    When I apply for a mortgage of $350000 with term 30 years
    Then the loan application should be approved
