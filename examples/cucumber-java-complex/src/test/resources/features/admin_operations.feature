Feature: Admin Operations
  As a banking platform administrator
  I want to monitor and manage the platform
  So that I can ensure reliable banking services

  Background:
    Given I am authenticated as an admin user

  Scenario: Check system health
    When I check the system health
    Then the health check should report "UP"

  Scenario: Retrieve platform metrics
    When I retrieve system metrics
    Then the metrics response should contain throughput data
    And only admin users should be able to view metrics

  Scenario: View audit logs
    When I retrieve audit logs
    Then the audit logs should contain recent entries

  Scenario: Generate official account statement
    When I retrieve the official statement for account "ACC-001"
    Then the statement should contain all transactions for the period

  Scenario Outline: Health endpoint reflects platform status
    When I check the system health
    Then the health check should report "<expectedStatus>"

    Examples:
      | expectedStatus |
      | UP             |
