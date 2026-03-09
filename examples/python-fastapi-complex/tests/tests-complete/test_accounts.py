"""
tests-complete/test_accounts.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: all account endpoints + business rules.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient
from app.helpers.path_builder import (
    account_balance_path,
    account_path,
    account_summary_path,
    accounts_path,
)
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)


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
    resp = accounts_client.list_accounts(alice_token)
    return resp.json()["items"][0]["id"]


# ---------------------------------------------------------------------------
# POST /accounts
# ---------------------------------------------------------------------------


class TestCreateAccount:
    def test_create_checking_account(self, alice_token):
        resp = client.post(
            accounts_path(),
            json={"account_type": "checking", "initial_deposit": "500.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["account_type"] == "checking"
        assert float(data["available_balance"]) == 500.00
        assert data["status"] == "active"

    def test_create_savings_account(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "savings", "initial_deposit": "1000.00"}, alice_token
        )
        assert resp.status_code == 201
        assert resp.json()["account_type"] == "savings"

    def test_create_investment_account(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "investment", "initial_deposit": "5000.00"}, alice_token
        )
        assert resp.status_code == 201
        assert resp.json()["account_type"] == "investment"

    def test_create_account_with_nickname(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "checking", "nickname": "Vacation Fund"}, alice_token
        )
        assert resp.status_code == 201
        assert resp.json()["nickname"] == "Vacation Fund"

    def test_create_account_currency_uppercased(self, alice_token):
        resp = client.post(
            accounts_path(),
            json={"account_type": "savings", "currency": "eur"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.json()["currency"] == "EUR"

    def test_create_account_no_auth_returns_401(self):
        resp = client.post(accounts_path(), json={"account_type": "checking"})
        assert resp.status_code == 401

    def test_create_account_invalid_type_returns_422(self, alice_token):
        resp = accounts_client.create_account({"account_type": "crypto"}, alice_token)
        assert resp.status_code == 422

    def test_create_account_negative_deposit_returns_422(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "-100.00"}, alice_token
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /accounts
# ---------------------------------------------------------------------------


class TestListAccounts:
    def test_list_returns_only_own_accounts(self, alice_token, bob_token):
        alice_resp = accounts_client.list_accounts(alice_token)
        bob_resp = accounts_client.list_accounts(bob_token)
        alice_ids = {a["id"] for a in alice_resp.json()["items"]}
        bob_ids = {a["id"] for a in bob_resp.json()["items"]}
        assert alice_ids.isdisjoint(bob_ids)

    def test_list_returns_pagination_metadata(self, alice_token):
        resp = client.get(
            accounts_path(),
            params={"page": 1, "page_size": 1},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        body = resp.json()
        assert body["page"] == 1
        assert body["page_size"] == 1
        assert len(body["items"]) <= 1

    def test_list_no_auth_returns_401(self):
        resp = client.get(accounts_path())
        assert resp.status_code == 401

    def test_admin_can_list_his_accounts(self, admin_token):
        resp = accounts_client.list_accounts(admin_token)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /accounts/{account_id}
# ---------------------------------------------------------------------------


class TestGetAccount:
    def test_get_own_account(self, alice_token, alice_account_id):
        resp = client.get(
            account_path(alice_account_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == alice_account_id

    def test_get_not_found_returns_404(self, alice_token):
        resp = accounts_client.get_account("nonexistent-id", alice_token)
        assert resp.status_code == 404

    def test_get_others_account_returns_403(self, alice_token, bob_token):
        bob_resp = accounts_client.list_accounts(bob_token)
        bob_id = bob_resp.json()["items"][0]["id"]
        resp = accounts_client.get_account(bob_id, alice_token)
        assert resp.status_code == 403

    def test_admin_can_access_any_account(self, alice_account_id, admin_token):
        resp = accounts_client.get_account(alice_account_id, admin_token)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# PUT /accounts/{account_id}
# ---------------------------------------------------------------------------


class TestUpdateAccount:
    def test_update_nickname(self, alice_token, alice_account_id):
        resp = accounts_client.update_account(
            alice_account_id, {"nickname": "New Name"}, alice_token
        )
        assert resp.status_code == 200
        assert resp.json()["nickname"] == "New Name"

    def test_update_status_to_suspended(self, alice_token, alice_account_id):
        resp = accounts_client.update_account(
            alice_account_id, {"status": "suspended"}, alice_token
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "suspended"

    def test_update_not_found_returns_404(self, alice_token):
        resp = accounts_client.update_account("ghost", {"nickname": "x"}, alice_token)
        assert resp.status_code == 404

    def test_update_others_account_returns_403(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.update_account(bob_id, {"nickname": "x"}, alice_token)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /accounts/{account_id}
# ---------------------------------------------------------------------------


class TestDeleteAccount:
    def test_delete_zero_balance_returns_204(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
        )
        account_id = resp.json()["id"]
        del_resp = accounts_client.delete_account(account_id, alice_token)
        assert del_resp.status_code == 204

    def test_delete_nonzero_balance_returns_400(self, alice_token, alice_account_id):
        resp = accounts_client.delete_account(alice_account_id, alice_token)
        assert resp.status_code == 400
        assert "zero balance" in resp.json()["error"].lower()

    def test_delete_nonexistent_returns_404(self, alice_token):
        resp = accounts_client.delete_account("ghost-id", alice_token)
        assert resp.status_code == 404

    def test_delete_already_closed_returns_400(self, alice_token):
        # Create and immediately close (zero balance)
        resp = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
        )
        account_id = resp.json()["id"]
        accounts_client.delete_account(account_id, alice_token)
        # Second delete attempt
        resp2 = accounts_client.delete_account(account_id, alice_token)
        assert resp2.status_code == 400

    def test_delete_others_account_returns_403(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.delete_account(bob_id, alice_token)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /accounts/{account_id}/balance
# ---------------------------------------------------------------------------


class TestGetBalance:
    def test_get_balance_returns_200(self, alice_token, alice_account_id):
        resp = client.get(
            account_balance_path(alice_account_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "available_balance" in body
        assert "current_balance" in body
        assert "currency" in body

    def test_get_balance_via_helper(self, alice_token, alice_account_id):
        resp = accounts_client.get_balance(alice_account_id, alice_token)
        assert resp.status_code == 200

    def test_balance_not_found_returns_404(self, alice_token):
        resp = accounts_client.get_balance("no-account", alice_token)
        assert resp.status_code == 404

    def test_balance_others_account_returns_403(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.get_balance(bob_id, alice_token)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /accounts/{account_id}/summary
# ---------------------------------------------------------------------------


class TestGetSummary:
    def test_get_summary_returns_200(self, alice_token, alice_account_id):
        resp = client.get(
            account_summary_path(alice_account_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "total_transactions" in body
        assert "monthly_spending" in body
        assert "monthly_income" in body

    def test_get_summary_via_helper(self, alice_token, alice_account_id):
        resp = accounts_client.get_summary(alice_account_id, alice_token)
        assert resp.status_code == 200

    def test_summary_not_found_returns_404(self, alice_token):
        resp = accounts_client.get_summary("ghost-account", alice_token)
        assert resp.status_code == 404

    def test_summary_others_account_returns_403(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.get_summary(bob_id, alice_token)
        assert resp.status_code == 403
