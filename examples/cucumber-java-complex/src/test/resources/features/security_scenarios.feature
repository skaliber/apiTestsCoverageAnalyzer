Feature: Security Scenarios
  As the banking platform operator
  I want all API endpoints to enforce authentication and authorization
  So that customer data is protected

  Scenario: Successful login returns an access token
    When I authenticate with username "customer@example.com" and password "P@ssw0rd-Test"
    Then I should receive a valid access token

  Scenario: Failed login with wrong password
    When I authenticate with invalid credentials
    Then authentication should fail with invalid credentials error

  Scenario: Access account without authentication
    Given I am not authenticated
    When I try to access account "ACC-001"
    Then I should receive a 401 unauthorized response

  Scenario: Non-admin user cannot access admin metrics
    Given I am authenticated with valid credentials
    When I retrieve system metrics
    Then I should receive a 403 forbidden response

  @NoAuth
  Scenario: Health endpoint is publicly accessible
    When I check the system health
    Then the health check should report "UP"

  Scenario: Logout clears the session
    Given I am authenticated with valid credentials
    When I log out
    Then the logout should succeed

  Scenario: Two-factor authentication required for large transfers
    Given I am authenticated with valid credentials
    And I have a checking account with balance $50000
    And a verified beneficiary with account "EXT-HIGH-VALUE"
    When I transfer $15000 to the beneficiary
    Then I should receive a 403 forbidden response
