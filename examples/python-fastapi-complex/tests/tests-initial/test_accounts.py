"""
tests-initial/test_accounts.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Initial test suite: covers account endpoints (~60% of account functionality).
Missing: balance endpoint, summary endpoint, full error scenarios.

Run:  pytest tests/tests-initial/test_accounts.py -v
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
    """Reset to a clean state before each test."""
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
def bob_token() -> str:
    resp = client.post(
        "/auth/token",
        data={"username": "bob", "password": "bob123"},
    )
    return resp.json()["access_token"]


@pytest.fixture
def alice_account_id(alice_token) -> str:
    resp = client.get("/accounts", headers={"Authorization": f"Bearer {alice_token}"})
    return resp.json()["items"][0]["id"]


# ---------------------------------------------------------------------------
# POST /accounts
# ---------------------------------------------------------------------------


class TestCreateAccount:
    def test_create_checking_account_returns_201(self, alice_token):
        response = client.post(
            "/accounts",
            json={"account_type": "checking", "currency": "USD", "initial_deposit": "500.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["account_type"] == "checking"
        assert data["currency"] == "USD"
        assert float(data["available_balance"]) == 500.00

    def test_create_savings_account_returns_201(self, alice_token):
        response = client.post(
            "/accounts",
            json={"account_type": "savings", "initial_deposit": "1000.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        assert response.json()["account_type"] == "savings"

    def test_create_account_with_nickname(self, alice_token):
        response = client.post(
            "/accounts",
            json={"account_type": "checking", "nickname": "My Fun Account"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        assert response.json()["nickname"] == "My Fun Account"

    def test_create_account_requires_auth(self):
        response = client.post(
            "/accounts",
            json={"account_type": "checking"},
        )
        assert response.status_code == 401

    def test_create_account_sets_owner(self, alice_token):
        resp = client.post(
            "/accounts",
            json={"account_type": "checking"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 201
        # Owner is auto-assigned from token; not exposed in response but account is listed
        account_id = resp.json()["id"]
        get_resp = client.get(
            f"/accounts/{account_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert get_resp.status_code == 200

    def test_create_account_invalid_type(self, alice_token):
        response = client.post(
            "/accounts",
            json={"account_type": "invalid_type"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 422

    def test_create_account_zero_initial_deposit(self, alice_token):
        response = client.post(
            "/accounts",
            json={"account_type": "savings", "initial_deposit": "0.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        assert float(response.json()["available_balance"]) == 0.00

    def test_create_account_currency_is_uppercased(self, alice_token):
        response = client.post(
            "/accounts",
            json={"account_type": "checking", "currency": "eur"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 201
        assert response.json()["currency"] == "EUR"


# ---------------------------------------------------------------------------
# GET /accounts
# ---------------------------------------------------------------------------


class TestListAccounts:
    def test_list_accounts_returns_200(self, alice_token):
        response = client.get(
            "/accounts",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_alice_sees_only_her_accounts(self, alice_token, bob_token):
        alice_resp = client.get("/accounts", headers={"Authorization": f"Bearer {alice_token}"})
        bob_resp = client.get("/accounts", headers={"Authorization": f"Bearer {bob_token}"})
        alice_ids = {a["id"] for a in alice_resp.json()["items"]}
        bob_ids = {a["id"] for a in bob_resp.json()["items"]}
        assert alice_ids.isdisjoint(bob_ids)

    def test_list_accounts_pagination(self, alice_token):
        response = client.get(
            "/accounts",
            params={"page": 1, "page_size": 1},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        assert len(response.json()["items"]) <= 1

    def test_list_accounts_requires_auth(self):
        response = client.get("/accounts")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /accounts/{account_id}
# ---------------------------------------------------------------------------


class TestGetAccount:
    def test_get_own_account_returns_200(self, alice_token, alice_account_id):
        response = client.get(
            f"/accounts/{alice_account_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        assert response.json()["id"] == alice_account_id

    def test_get_nonexistent_account_returns_404(self, alice_token):
        response = client.get(
            "/accounts/does-not-exist",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 404

    def test_get_others_account_returns_403(self, alice_token, bob_token):
        bob_resp = client.get("/accounts", headers={"Authorization": f"Bearer {bob_token}"})
        bobs_account_id = bob_resp.json()["items"][0]["id"]
        response = client.get(
            f"/accounts/{bobs_account_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 403

    def test_get_account_requires_auth(self, alice_account_id):
        response = client.get(f"/accounts/{alice_account_id}")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# PUT /accounts/{account_id}
# ---------------------------------------------------------------------------


class TestUpdateAccount:
    def test_update_account_nickname(self, alice_token, alice_account_id):
        response = client.put(
            f"/accounts/{alice_account_id}",
            json={"nickname": "Updated Nickname"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 200
        assert response.json()["nickname"] == "Updated Nickname"

    def test_update_nonexistent_account_returns_404(self, alice_token):
        response = client.put(
            "/accounts/ghost-account",
            json={"nickname": "Ghost"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 404

    def test_update_others_account_returns_403(self, alice_token, bob_token):
        bob_resp = client.get("/accounts", headers={"Authorization": f"Bearer {bob_token}"})
        bobs_account_id = bob_resp.json()["items"][0]["id"]
        response = client.put(
            f"/accounts/{bobs_account_id}",
            json={"nickname": "Hacked"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /accounts/{account_id}
# ---------------------------------------------------------------------------


class TestDeleteAccount:
    def _zero_out_account(self, account_id: str, token: str):
        """Helper: drain the account balance to zero via a debit transaction."""
        info = client.get(
            f"/accounts/{account_id}",
            headers={"Authorization": f"Bearer {token}"},
        ).json()
        balance = float(info["available_balance"])
        if balance > 0:
            client.post(
                "/transactions",
                json={
                    "account_id": account_id,
                    "amount": str(balance),
                    "transaction_type": "debit",
                    "description": "Drain to close",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

    def test_delete_zero_balance_account_returns_204(self, alice_token):
        # Create a new account with zero balance
        resp = client.post(
            "/accounts",
            json={"account_type": "checking", "initial_deposit": "0.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        account_id = resp.json()["id"]
        delete_resp = client.delete(
            f"/accounts/{account_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert delete_resp.status_code == 204

    def test_delete_non_zero_balance_returns_400(self, alice_token, alice_account_id):
        response = client.delete(
            f"/accounts/{alice_account_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 400
        assert "zero balance" in response.json()["error"].lower()

    def test_delete_nonexistent_account_returns_404(self, alice_token):
        response = client.delete(
            "/accounts/nonexistent-id",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert response.status_code == 404
