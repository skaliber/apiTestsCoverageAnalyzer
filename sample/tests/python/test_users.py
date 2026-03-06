"""
Sample pytest test suite for the Users/Orders API.

Uses the ``requests`` library to make HTTP calls.

Covers:
    GET  /users          – list all users
    POST /users          – create a user
    GET  /users/{id}     – get user by ID
    GET  /orders         – list orders
    POST /orders         – create an order

Not covered (gap):
    PUT    /users/{id}   – update user
    DELETE /users/{id}   – delete user
"""

import pytest
import requests

BASE_URL = "http://localhost:8080"


# ── GET /users ────────────────────────────────────────────────────────────────

class TestGetUsers:
    def test_list_users_returns_200(self):
        response = requests.get(f"{BASE_URL}/users")
        assert response.status_code == 200

    def test_list_users_returns_json_array(self):
        response = requests.get(f"{BASE_URL}/users")
        assert isinstance(response.json(), list)


# ── POST /users ───────────────────────────────────────────────────────────────

class TestCreateUser:
    def test_create_user_valid_payload_returns_201(self):
        response = requests.post(
            f"{BASE_URL}/users",
            json={"name": "Alice", "email": "alice@example.com"},
        )
        assert response.status_code == 201
        assert response.json()["name"] == "Alice"

    def test_create_user_missing_name_returns_400(self):
        response = requests.post(
            f"{BASE_URL}/users",
            json={"email": "noname@example.com"},
        )
        assert response.status_code == 400
        assert "error" in response.json()

    def test_create_user_invalid_email_returns_422(self):
        response = requests.post(
            f"{BASE_URL}/users",
            json={"name": "Bob", "email": "not-an-email"},
        )
        assert response.status_code in (400, 422)


# ── GET /users/{id} ───────────────────────────────────────────────────────────

class TestGetUserById:
    def test_get_user_by_id_existing_returns_200(self):
        response = requests.get(f"{BASE_URL}/users/1")
        assert response.status_code == 200

    def test_get_user_by_id_missing_returns_404(self):
        response = requests.get(f"{BASE_URL}/users/999999")
        assert response.status_code == 404


# ── GET /orders ───────────────────────────────────────────────────────────────

class TestGetOrders:
    def test_list_orders_returns_200(self):
        response = requests.get(f"{BASE_URL}/orders")
        assert response.status_code == 200


# ── POST /orders ──────────────────────────────────────────────────────────────

class TestCreateOrder:
    def test_create_order_valid_payload_returns_201(self):
        response = requests.post(
            f"{BASE_URL}/orders",
            json={"userId": 1, "item": "widget", "quantity": 2},
        )
        assert response.status_code == 201
