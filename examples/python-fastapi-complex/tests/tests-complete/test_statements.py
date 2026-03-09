"""
tests-complete/test_statements.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: statements endpoints including month validation.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient, StatementsClient, TransactionsClient
from app.helpers.path_builder import statement_month_path, statements_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)
statements_client = StatementsClient(client)
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
def alice_account_id(alice_token) -> str:
    return accounts_client.list_accounts(alice_token).json()["items"][0]["id"]


@pytest.fixture
def bob_account_id(bob_token) -> str:
    return accounts_client.list_accounts(bob_token).json()["items"][0]["id"]


@pytest.fixture
def current_month() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ---------------------------------------------------------------------------
# GET /statements/{account_id}
# ---------------------------------------------------------------------------


class TestListStatements:
    def test_list_statements_returns_200(self, alice_token, alice_account_id):
        resp = client.get(
            statements_path(alice_account_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["account_id"] == alice_account_id
        assert "statements" in body

    def test_list_statements_via_helper(self, alice_token, alice_account_id):
        resp = statements_client.list_statements(alice_account_id, alice_token)
        assert resp.status_code == 200

    def test_statement_appears_after_transaction(self, alice_token, alice_account_id, current_month):
        txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "100.00",
                "transaction_type": "credit",
                "description": "Statement trigger",
            },
            alice_token,
        )
        resp = statements_client.list_statements(alice_account_id, alice_token)
        months = [s["month"] for s in resp.json()["statements"]]
        assert current_month in months

    def test_account_not_found_returns_404(self, alice_token):
        resp = statements_client.list_statements("ghost-account", alice_token)
        assert resp.status_code == 404

    def test_others_account_returns_403(self, alice_token, bob_account_id):
        resp = statements_client.list_statements(bob_account_id, alice_token)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_account_id):
        resp = client.get(statements_path(alice_account_id))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /statements/{account_id}/{month}
# ---------------------------------------------------------------------------


class TestGetStatementByMonth:
    def test_get_statement_for_current_month(self, alice_token, alice_account_id, current_month):
        txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "250.00",
                "transaction_type": "credit",
                "description": "Paycheck",
            },
            alice_token,
        )
        resp = client.get(
            statement_month_path(alice_account_id, current_month),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["month"] == current_month
        assert float(body["total_credits"]) >= 250.00

    def test_get_statement_via_helper(self, alice_token, alice_account_id, current_month):
        txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "100.00",
                "transaction_type": "credit",
                "description": "Any txn",
            },
            alice_token,
        )
        resp = statements_client.get_statement(alice_account_id, current_month, alice_token)
        assert resp.status_code == 200

    def test_invalid_month_format_returns_400(self, alice_token, alice_account_id):
        resp = statements_client.get_statement(alice_account_id, "January-2024", alice_token)
        assert resp.status_code == 400

    def test_invalid_month_13_returns_400(self, alice_token, alice_account_id):
        resp = statements_client.get_statement(alice_account_id, "2024-13", alice_token)
        assert resp.status_code == 400

    def test_account_not_found_returns_404(self, alice_token, current_month):
        resp = statements_client.get_statement("ghost", current_month, alice_token)
        assert resp.status_code == 404

    def test_others_account_returns_403(self, alice_token, bob_account_id, current_month):
        resp = statements_client.get_statement(bob_account_id, current_month, alice_token)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_account_id, current_month):
        resp = client.get(statement_month_path(alice_account_id, current_month))
        assert resp.status_code == 401

    def test_statement_contains_entries(self, alice_token, alice_account_id, current_month):
        txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "100.00",
                "transaction_type": "credit",
                "description": "Entry test",
            },
            alice_token,
        )
        resp = statements_client.get_statement(alice_account_id, current_month, alice_token)
        body = resp.json()
        assert "entries" in body
        assert len(body["entries"]) > 0
