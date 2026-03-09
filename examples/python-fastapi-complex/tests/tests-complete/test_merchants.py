"""
tests-complete/test_merchants.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: merchant endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AuthClient, MerchantsClient
from app.helpers.path_builder import merchant_path, merchants_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
merchants_client = MerchantsClient(client)


@pytest.fixture(autouse=True)
def reset_db():
    reset_database()
    yield


@pytest.fixture
def alice_token() -> str:
    return auth_client.get_token("alice", "alice123")


# ---------------------------------------------------------------------------
# GET /merchants
# ---------------------------------------------------------------------------


class TestListMerchants:
    def test_list_merchants_returns_200(self, alice_token):
        resp = client.get(
            merchants_path(),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "total" in body
        assert body["total"] >= 3  # seed has 3 merchants

    def test_list_merchants_via_helper(self, alice_token):
        resp = merchants_client.list_merchants(alice_token)
        assert resp.status_code == 200

    def test_pagination(self, alice_token):
        resp = client.get(
            merchants_path(),
            params={"page": 1, "page_size": 2},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 2

    def test_no_auth_returns_401(self):
        resp = client.get(merchants_path())
        assert resp.status_code == 401

    def test_merchant_has_required_fields(self, alice_token):
        resp = merchants_client.list_merchants(alice_token)
        for m in resp.json()["items"]:
            assert "id" in m
            assert "name" in m
            assert "category" in m
            assert "mcc_code" in m
            assert "country" in m


# ---------------------------------------------------------------------------
# GET /merchants/{merchant_id}
# ---------------------------------------------------------------------------


class TestGetMerchant:
    def test_get_merchant_by_id(self, alice_token):
        resp = client.get(
            merchant_path("merch-001"),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "merch-001"
        assert body["name"] == "Blue Bottle Coffee"

    def test_get_merchant_via_helper(self, alice_token):
        resp = merchants_client.get_merchant("merch-002", alice_token)
        assert resp.status_code == 200
        assert resp.json()["id"] == "merch-002"

    def test_get_all_seed_merchants(self, alice_token):
        for merchant_id in ["merch-001", "merch-002", "merch-003"]:
            resp = merchants_client.get_merchant(merchant_id, alice_token)
            assert resp.status_code == 200

    def test_not_found_returns_404(self, alice_token):
        resp = merchants_client.get_merchant("ghost-merchant", alice_token)
        assert resp.status_code == 404

    def test_no_auth_returns_401(self):
        resp = client.get(merchant_path("merch-001"))
        assert resp.status_code == 401
