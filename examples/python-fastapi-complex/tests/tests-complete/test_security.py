"""
tests-complete/test_security.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Security-focused tests: authentication, authorization, token handling,
injection attempts, and cross-user data isolation.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient, TransactionsClient
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


# ---------------------------------------------------------------------------
# Authentication failures
# ---------------------------------------------------------------------------


class TestAuthenticationFailures:
    def test_no_token_on_accounts(self):
        resp = client.get("/accounts")
        assert resp.status_code == 401

    def test_no_token_on_transactions(self):
        resp = client.get("/transactions")
        assert resp.status_code == 401

    def test_no_token_on_transfers(self):
        resp = client.post("/transfers", json={})
        assert resp.status_code == 401

    def test_no_token_on_limits(self):
        resp = client.get("/limits/some-account")
        assert resp.status_code == 401

    def test_no_token_on_statements(self):
        resp = client.get("/statements/some-account")
        assert resp.status_code == 401

    def test_no_token_on_cards(self):
        resp = client.get("/cards/some-card")
        assert resp.status_code == 401

    def test_no_token_on_merchants(self):
        resp = client.get("/merchants")
        assert resp.status_code == 401

    def test_no_token_on_admin_health(self):
        resp = client.get("/admin/health")
        assert resp.status_code == 401

    def test_no_token_on_admin_stats(self):
        resp = client.get("/admin/stats")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self):
        resp = client.get(
            "/accounts",
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
        assert resp.status_code == 401

    def test_malformed_authorization_header_returns_401(self):
        resp = client.get(
            "/accounts",
            headers={"Authorization": "NotBearer token"},
        )
        assert resp.status_code == 401

    def test_wrong_password_returns_401(self):
        resp = auth_client.login("alice", "wrongpassword")
        assert resp.status_code == 401

    def test_nonexistent_user_returns_401(self):
        resp = auth_client.login("nobody", "anypassword")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Authorization: cross-user data isolation
# ---------------------------------------------------------------------------


class TestCrossUserIsolation:
    def test_alice_cannot_see_bobs_accounts(self, alice_token, bob_token):
        bob_accounts = accounts_client.list_accounts(bob_token).json()["items"]
        alice_accounts = accounts_client.list_accounts(alice_token).json()["items"]
        bob_ids = {a["id"] for a in bob_accounts}
        alice_ids = {a["id"] for a in alice_accounts}
        assert bob_ids.isdisjoint(alice_ids)

    def test_alice_cannot_read_bobs_account(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.get_account(bob_id, alice_token)
        assert resp.status_code == 403

    def test_alice_cannot_transact_on_bobs_account(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = txn_client.create_transaction(
            {
                "account_id": bob_id,
                "amount": "1.00",
                "transaction_type": "debit",
                "description": "Cross-user debit",
            },
            alice_token,
        )
        assert resp.status_code == 403

    def test_alice_cannot_view_bobs_limits(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = client.get(
            f"/limits/{bob_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 403

    def test_alice_cannot_view_bobs_statements(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = client.get(
            f"/statements/{bob_id}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Admin-only endpoints
# ---------------------------------------------------------------------------


class TestAdminOnlyEndpoints:
    def test_regular_user_cannot_access_stats(self, alice_token):
        resp = client.get("/admin/stats", headers={"Authorization": f"Bearer {alice_token}"})
        assert resp.status_code == 403

    def test_regular_user_can_access_health(self, alice_token):
        """Health is authenticated but not admin-only."""
        resp = client.get("/admin/health", headers={"Authorization": f"Bearer {alice_token}"})
        assert resp.status_code == 200

    def test_admin_can_access_stats(self, admin_token):
        resp = client.get("/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200

    def test_admin_can_access_any_account(self, admin_token, alice_token):
        alice_id = accounts_client.list_accounts(alice_token).json()["items"][0]["id"]
        resp = accounts_client.get_account(alice_id, admin_token)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Token lifecycle security
# ---------------------------------------------------------------------------


class TestTokenSecurity:
    def test_refresh_token_rotation(self):
        """Used refresh token must be rejected on re-use."""
        login_resp = auth_client.login("alice", "alice123")
        old_refresh = login_resp.json()["refresh_token"]
        auth_client.refresh(old_refresh)
        # Second use of same refresh token should fail
        second_resp = auth_client.refresh(old_refresh)
        assert second_resp.status_code == 401

    def test_access_token_contains_no_password(self):
        """Sanity: access token payload should not contain password."""
        login_resp = auth_client.login("alice", "alice123")
        token = login_resp.json()["access_token"]
        # Decode header.payload (no verification — just check payload)
        import base64

        parts = token.split(".")
        assert len(parts) == 3
        padding = 4 - len(parts[1]) % 4
        payload_str = base64.urlsafe_b64decode(parts[1] + "=" * padding).decode()
        assert "password" not in payload_str
        assert "alice123" not in payload_str

    def test_expired_or_tampered_token_returns_401(self):
        """A clearly invalid JWT is rejected."""
        resp = client.get(
            "/accounts",
            headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.INVALIDSIG"},
        )
        assert resp.status_code == 401
