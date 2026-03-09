"""
tests-complete/test_transactions.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: all transaction endpoints + business rules + edge cases.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient, TransactionsClient
from app.helpers.path_builder import transaction_path, transactions_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)
txn_client = TransactionsClient(client)


@pytest.fixture(autouse=True)
def reset_db():
    reset_database()
    yield


@pytest.fixture
def alice_token() -> str:
    return auth_client.get_token("alice", "alice123")


@pytest.fixture
def bob_token() -> str:
    return auth_client.get_token("bob", "bob123")


@pytest.fixture
def admin_token() -> str:
    return auth_client.get_token("admin", "admin123")


@pytest.fixture
def alice_account_id(alice_token) -> str:
    return accounts_client.list_accounts(alice_token).json()["items"][0]["id"]


@pytest.fixture
def empty_account_id(alice_token) -> str:
    resp = accounts_client.create_account(
        {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
    )
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# POST /transactions
# ---------------------------------------------------------------------------


class TestCreateTransaction:
    def test_create_credit_returns_201(self, alice_token, alice_account_id):
        resp = client.post(
            transactions_path(),
            json={
                "account_id": alice_account_id,
                "amount": "100.00",
                "transaction_type": "credit",
                "description": "Direct deposit",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "completed"

    def test_create_debit_returns_201(self, alice_token, alice_account_id):
        resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "50.00",
                "transaction_type": "debit",
                "description": "Grocery run",
            },
            alice_token,
        )
        assert resp.status_code == 201

    def test_create_fee_transaction(self, alice_token, alice_account_id):
        resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "15.00",
                "transaction_type": "fee",
                "description": "Monthly account fee",
            },
            alice_token,
        )
        assert resp.status_code == 201
        assert resp.json()["transaction_type"] == "fee"

    def test_idempotency_key_prevents_duplicate(self, alice_token, alice_account_id):
        payload = {
            "account_id": alice_account_id,
            "amount": "75.00",
            "transaction_type": "credit",
            "description": "Idempotent credit",
            "idempotency_key": "idem-key-001",
        }
        resp1 = txn_client.create_transaction(payload, alice_token)
        resp2 = txn_client.create_transaction(payload, alice_token)
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert resp1.json()["id"] == resp2.json()["id"]

    def test_insufficient_funds_returns_400(self, alice_token, empty_account_id):
        resp = txn_client.create_transaction(
            {
                "account_id": empty_account_id,
                "amount": "999.00",
                "transaction_type": "debit",
                "description": "Overdraft",
            },
            alice_token,
        )
        assert resp.status_code == 400
        assert "insufficient" in resp.json()["error"].lower()

    def test_account_not_found_returns_404(self, alice_token):
        resp = txn_client.create_transaction(
            {
                "account_id": "ghost-acct",
                "amount": "10.00",
                "transaction_type": "debit",
                "description": "Ghost",
            },
            alice_token,
        )
        assert resp.status_code == 404

    def test_suspended_account_returns_400(self, alice_token, alice_account_id):
        accounts_client.update_account(alice_account_id, {"status": "suspended"}, alice_token)
        resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "10.00",
                "transaction_type": "credit",
                "description": "Suspended attempt",
            },
            alice_token,
        )
        assert resp.status_code == 400
        assert "suspended" in resp.json()["error"].lower()

    def test_closed_account_returns_400(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
        )
        closed_id = resp.json()["id"]
        accounts_client.delete_account(closed_id, alice_token)

        resp = txn_client.create_transaction(
            {
                "account_id": closed_id,
                "amount": "10.00",
                "transaction_type": "credit",
                "description": "Closed attempt",
            },
            alice_token,
        )
        assert resp.status_code == 400
        assert "closed" in resp.json()["error"].lower()

    def test_access_others_account_returns_403(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = txn_client.create_transaction(
            {
                "account_id": bob_id,
                "amount": "10.00",
                "transaction_type": "credit",
                "description": "Cross-user attempt",
            },
            alice_token,
        )
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_account_id):
        resp = client.post(
            transactions_path(),
            json={
                "account_id": alice_account_id,
                "amount": "10.00",
                "transaction_type": "credit",
                "description": "Unauthenticated",
            },
        )
        assert resp.status_code == 401

    def test_transaction_with_merchant_id(self, alice_token, alice_account_id):
        resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "25.00",
                "transaction_type": "debit",
                "description": "Coffee",
                "merchant_id": "merch-001",
            },
            alice_token,
        )
        assert resp.status_code == 201
        assert resp.json()["merchant_id"] == "merch-001"

    def test_credit_updates_balance(self, alice_token, alice_account_id):
        before = float(
            accounts_client.get_account(alice_account_id, alice_token).json()["available_balance"]
        )
        txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "300.00",
                "transaction_type": "credit",
                "description": "Test credit",
            },
            alice_token,
        )
        after = float(
            accounts_client.get_account(alice_account_id, alice_token).json()["available_balance"]
        )
        assert after == before + 300.00


# ---------------------------------------------------------------------------
# GET /transactions
# ---------------------------------------------------------------------------


class TestListTransactions:
    def test_list_all_returns_200(self, alice_token):
        resp = client.get(
            transactions_path(),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert "items" in resp.json()

    def test_filter_by_account(self, alice_token, alice_account_id):
        resp = txn_client.list_transactions(alice_token, account_id=alice_account_id)
        assert resp.status_code == 200
        for txn in resp.json()["items"]:
            assert txn["account_id"] == alice_account_id

    def test_filter_by_nonexistent_account_returns_404(self, alice_token):
        resp = client.get(
            transactions_path(),
            params={"account_id": "ghost"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 404

    def test_filter_others_account_returns_403(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = client.get(
            transactions_path(),
            params={"account_id": bob_id},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 403

    def test_pagination(self, alice_token):
        resp = client.get(
            transactions_path(),
            params={"page": 1, "page_size": 1},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 1

    def test_no_auth_returns_401(self):
        resp = client.get(transactions_path())
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /transactions/{transaction_id}
# ---------------------------------------------------------------------------


class TestGetTransaction:
    def test_get_transaction_by_id(self, alice_token, alice_account_id):
        create_resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "12.00",
                "transaction_type": "credit",
                "description": "Single txn",
            },
            alice_token,
        )
        txn_id = create_resp.json()["id"]

        resp = client.get(
            transaction_path(txn_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == txn_id

    def test_get_via_helper(self, alice_token, alice_account_id):
        create_resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "8.00",
                "transaction_type": "credit",
                "description": "Helper test",
            },
            alice_token,
        )
        txn_id = create_resp.json()["id"]
        resp = txn_client.get_transaction(txn_id, alice_token)
        assert resp.status_code == 200

    def test_not_found_returns_404(self, alice_token):
        resp = txn_client.get_transaction("ghost-txn", alice_token)
        assert resp.status_code == 404

    def test_no_auth_returns_401(self):
        resp = client.get(transaction_path("some-id"))
        assert resp.status_code == 401
