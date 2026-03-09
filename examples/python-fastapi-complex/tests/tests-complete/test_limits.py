"""
tests-complete/test_limits.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: limits endpoints + edge cases.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient, LimitsClient
from app.helpers.path_builder import limits_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)
limits_client = LimitsClient(client)


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


# ---------------------------------------------------------------------------
# GET /limits/{account_id}
# ---------------------------------------------------------------------------


class TestGetLimits:
    def test_get_limits_returns_200(self, alice_token, alice_account_id):
        resp = client.get(
            limits_path(alice_account_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["account_id"] == alice_account_id
        assert len(body["limits"]) == 4  # daily_transfer, single_transaction, monthly, atm

    def test_get_limits_via_helper(self, alice_token, alice_account_id):
        resp = limits_client.get_limits(alice_account_id, alice_token)
        assert resp.status_code == 200

    def test_limits_include_remaining(self, alice_token, alice_account_id):
        resp = limits_client.get_limits(alice_account_id, alice_token)
        for lim in resp.json()["limits"]:
            assert "remaining" in lim
            assert float(lim["remaining"]) >= 0

    def test_get_limits_account_not_found(self, alice_token):
        resp = limits_client.get_limits("ghost-account", alice_token)
        assert resp.status_code == 404

    def test_get_limits_others_account_returns_403(self, alice_token, bob_account_id):
        resp = limits_client.get_limits(bob_account_id, alice_token)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_account_id):
        resp = client.get(limits_path(alice_account_id))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PUT /limits/{account_id}
# ---------------------------------------------------------------------------


class TestUpdateLimits:
    def test_update_daily_transfer_limit(self, alice_token, alice_account_id):
        resp = client.put(
            limits_path(alice_account_id),
            json={"limit_type": "daily_transfer", "amount": "5000.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        limits = resp.json()["limits"]
        daily = next(l for l in limits if l["limit_type"] == "daily_transfer")
        assert float(daily["amount"]) == 5000.00

    def test_update_atm_withdrawal_limit(self, alice_token, alice_account_id):
        resp = limits_client.update_limits(
            alice_account_id,
            {"limit_type": "atm_withdrawal", "amount": "500.00"},
            alice_token,
        )
        assert resp.status_code == 200

    def test_update_limits_account_not_found(self, alice_token):
        resp = limits_client.update_limits(
            "ghost-account",
            {"limit_type": "daily_transfer", "amount": "1000.00"},
            alice_token,
        )
        assert resp.status_code == 404

    def test_update_limits_others_account_returns_403(self, alice_token, bob_account_id):
        resp = limits_client.update_limits(
            bob_account_id,
            {"limit_type": "daily_transfer", "amount": "1000.00"},
            alice_token,
        )
        assert resp.status_code == 403

    def test_update_limit_zero_amount_returns_422(self, alice_token, alice_account_id):
        resp = limits_client.update_limits(
            alice_account_id,
            {"limit_type": "daily_transfer", "amount": "0.00"},
            alice_token,
        )
        assert resp.status_code == 422

    def test_no_auth_returns_401(self, alice_account_id):
        resp = client.put(
            limits_path(alice_account_id),
            json={"limit_type": "daily_transfer", "amount": "500.00"},
        )
        assert resp.status_code == 401
