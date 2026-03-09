"""
tests-complete/test_admin.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: admin health + stats endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AdminClient, AuthClient
from app.helpers.path_builder import admin_health_path, admin_stats_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
admin_client = AdminClient(client)


@pytest.fixture(autouse=True)
def reset_db():
    reset_database()
    yield


@pytest.fixture
def alice_token() -> str:
    return auth_client.get_token("alice", "alice123")


@pytest.fixture
def admin_token() -> str:
    return auth_client.get_token("admin", "admin123")


# ---------------------------------------------------------------------------
# GET /admin/health
# ---------------------------------------------------------------------------


class TestAdminHealth:
    def test_health_returns_200_for_authenticated_user(self, alice_token):
        resp = client.get(
            admin_health_path(),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "version" in body
        assert "uptime_seconds" in body

    def test_health_via_helper(self, alice_token):
        resp = admin_client.health(alice_token)
        assert resp.status_code == 200

    def test_health_contains_database_field(self, alice_token):
        resp = admin_client.health(alice_token)
        assert "database" in resp.json()

    def test_health_no_auth_returns_401(self):
        resp = client.get(admin_health_path())
        assert resp.status_code == 401

    def test_health_admin_token_works(self, admin_token):
        resp = admin_client.health(admin_token)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /admin/stats
# ---------------------------------------------------------------------------


class TestAdminStats:
    def test_stats_requires_admin_role(self, alice_token):
        resp = client.get(
            admin_stats_path(),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 403

    def test_stats_accessible_by_admin(self, admin_token):
        resp = client.get(
            admin_stats_path(),
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "total_accounts" in body
        assert "active_accounts" in body
        assert "total_transactions_today" in body
        assert "total_cards" in body

    def test_stats_via_helper(self, admin_token):
        resp = admin_client.stats(admin_token)
        assert resp.status_code == 200

    def test_stats_no_auth_returns_401(self):
        resp = client.get(admin_stats_path())
        assert resp.status_code == 401

    def test_stats_total_accounts_positive(self, admin_token):
        resp = admin_client.stats(admin_token)
        assert resp.json()["total_accounts"] >= 3  # seed has 3 accounts

    def test_stats_uptime_positive(self, admin_token):
        resp = admin_client.stats(admin_token)
        assert float(resp.json()["uptime_seconds"]) > 0


# ---------------------------------------------------------------------------
# Auth endpoints coverage
# ---------------------------------------------------------------------------


class TestAuthEndpoints:
    def test_token_endpoint_returns_tokens(self):
        resp = auth_client.login("alice", "alice123")
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"

    def test_invalid_credentials_returns_401(self):
        resp = auth_client.login("alice", "wrongpassword")
        assert resp.status_code == 401

    def test_refresh_token_returns_new_access_token(self):
        login_resp = auth_client.login("alice", "alice123")
        refresh_token = login_resp.json()["refresh_token"]

        refresh_resp = auth_client.refresh(refresh_token)
        assert refresh_resp.status_code == 200
        assert "access_token" in refresh_resp.json()

    def test_invalid_refresh_token_returns_401(self):
        resp = auth_client.refresh("not-a-valid-token")
        assert resp.status_code == 401

    def test_refresh_token_is_rotated(self):
        """After refresh, old refresh token should be invalidated."""
        login_resp = auth_client.login("alice", "alice123")
        old_refresh = login_resp.json()["refresh_token"]

        auth_client.refresh(old_refresh)
        # Try to use old refresh token again — should fail
        resp = auth_client.refresh(old_refresh)
        assert resp.status_code == 401
