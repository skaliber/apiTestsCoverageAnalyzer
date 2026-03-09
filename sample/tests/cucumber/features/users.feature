Feature: Users API
  As an API consumer
  I want to manage users
  So that I can create, retrieve, update and delete user records

  Background:
    Given the API is running at "http://localhost:8080"

  # ── GET /users ──────────────────────────────────────────────────────────────

  Scenario: List all users
    When I send a GET request to /users
    Then the response status should be 200
    And the response body should be a JSON array

  Scenario: List users returns content-type JSON
    When I send a GET request to /users
    Then the response content-type should include "application/json"

  # ── POST /users ─────────────────────────────────────────────────────────────

  Scenario: Create a user with a valid payload
    Given I have a JSON body '{"name":"Alice","email":"alice@example.com"}'
    When I send a POST request to /users
    Then the response status should be 201
    And the response body should contain "Alice"

  Scenario: Create a user without a name returns 400
    Given I have a JSON body '{"email":"noname@example.com"}'
    When I send a POST request to /users
    Then the response status should be 400

  # ── GET /users/{id} ─────────────────────────────────────────────────────────

  Scenario: Get an existing user by ID
    When I send a GET request to /users/1
    Then the response status should be 200

  Scenario: Get a non-existent user returns 404
    When I send a GET request to /users/999999
    Then the response status should be 404

  # ── GET /orders ─────────────────────────────────────────────────────────────

  Scenario: List all orders
    When I send a GET request to /orders
    Then the response status should be 200
