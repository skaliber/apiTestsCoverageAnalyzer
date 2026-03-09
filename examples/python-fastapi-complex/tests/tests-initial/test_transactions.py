"""
tests-initial/test_transactions.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Initial test suite: covers basic transaction endpoints (~50% of transaction
functionality).  Missing: error scenarios, suspended-account rule,
idempotency, and list-filtering tests.

Run:  pytest tests/tests-initial/test_transactions.py -v
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_db():
    reset_database()
    yield


@pytest.fixture
def alice_token() -> str:
    resp = client.post(
        "/auth/token",
        data={"username": "alice", "password": "alice123"},
    )
    return resp.json()["access_token"]


@pytest.fixture
def alice_account_id(alice_token) -> str:
    resp = client.get("/accounts", headers={"Authorization": f"Bearer {alice_token}"})
    return resp.json()["items"][0]["id"]


# ---------------------------------------------------------------------------
# POST /transactions
# ---------------------------------------------------------------------------


class TestCreateTransaction:
    def test_create_credit_transaction(self, alice_token, alice_account_id):
        response = client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "100.00",
                "transaction_type": "credit",
                "description": "Salary deposit",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["transaction_type"] == "credit"
        assert float(data["amount"]) == 100.00
        assert data["status"] == "completed"

    def test_create_debit_transaction(self, alice_token, alice_account_id):
        response = client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "50.00",
                "transaction_type": "debit",
                "description": "Grocery purchase",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        assert response.json()["transaction_type"] == "debit"

    def test_create_transaction_requires_auth(self, alice_account_id):
        response = client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "10.00",
                "transaction_type": "debit",
                "description": "Unauthenticated test",
            },
        )
        assert response.status_code == 401

    def test_debit_increases_then_decreases_balance(self, alice_token, alice_account_id):
        # Get initial balance
        initial = float(
            client.get(
                f"/accounts/{alice_account_id}",
                headers={"Authorization": f"Bearer {alice_token}"},
            ).json()["available_balance"]
        )

        # Credit
        client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "200.00",
                "transaction_type": "credit",
                "description": "Credit",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )

        after_credit = float(
            client.get(
                f"/accounts/{alice_account_id}",
                headers={"Authorization": f"Bearer {alice_token}"},
            ).json()["available_balance"]
        )
        assert after_credit == initial + 200.00

        # Debit
        client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "75.00",
                "transaction_type": "debit",
                "description": "Debit",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )

        after_debit = float(
            client.get(
                f"/accounts/{alice_account_id}",
                headers={"Authorization": f"Bearer {alice_token}"},
            ).json()["available_balance"]
        )
        assert after_debit == after_credit - 75.00

    def test_debit_insufficient_funds_returns_400(self, alice_token):
        # Create a new account with zero balance
        resp = client.post(
            "/accounts",
            json={"account_type": "checking", "initial_deposit": "0.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        empty_account_id = resp.json()["id"]

        response = client.post(
            "/transactions",
            json={
                "account_id": empty_account_id,
                "amount": "100.00",
                "transaction_type": "debit",
                "description": "Overdraft attempt",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 400
        assert "insufficient" in response.json()["error"].lower()

    def test_create_transaction_invalid_account_returns_404(self, alice_token):
        response = client.post(
            "/transactions",
            json={
                "account_id": "does-not-exist",
                "amount": "10.00",
                "transaction_type": "debit",
                "description": "Ghost account",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 404

    def test_create_transaction_with_metadata(self, alice_token, alice_account_id):
        response = client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "22.50",
                "transaction_type": "debit",
                "description": "Amazon purchase",
                "metadata": {"item": "book", "category": "education"},
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        assert response.json()["metadata"]["item"] == "book"


# ---------------------------------------------------------------------------
# GET /transactions
# ---------------------------------------------------------------------------


class TestListTransactions:
    def test_list_transactions_returns_200(self, alice_token):
        response = client.get(
            "/transactions",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_list_transactions_filtered_by_account(self, alice_token, alice_account_id):
        response = client.get(
            "/transactions",
            params={"account_id": alice_account_id},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        for txn in response.json()["items"]:
            assert txn["account_id"] == alice_account_id

    def test_list_transactions_requires_auth(self):
        response = client.get("/transactions")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /transactions/{transaction_id}
# ---------------------------------------------------------------------------


class TestGetTransaction:
    def test_get_transaction_returns_200(self, alice_token, alice_account_id):
        # Create a transaction first
        create_resp = client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "amount": "30.00",
                "transaction_type": "credit",
                "description": "Direct deposit",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        txn_id = create_resp.json()["id"]

        response = client.get(
            f"/transactions/{txn_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        assert response.json()["id"] == txn_id

    def test_get_nonexistent_transaction_returns_404(self, alice_token):
        response = client.get(
            "/transactions/nonexistent-txn",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 404

    def test_get_transaction_requires_auth(self):
        response = client.get("/transactions/some-id")
        assert response.status_code == 401
