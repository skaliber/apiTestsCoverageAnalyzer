"""
tests-complete/test_cards.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: all card lifecycle endpoints + business rules.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient, CardsClient
from app.helpers.path_builder import card_path, card_status_path, cards_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)
cards_client = CardsClient(client)


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
def alice_card_id(alice_token, alice_account_id) -> str:
    resp = cards_client.issue_card(
        {"account_id": alice_account_id, "card_type": "debit", "cardholder_name": "Alice Johnson"},
        alice_token,
    )
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# POST /cards
# ---------------------------------------------------------------------------


class TestIssueCard:
    def test_issue_debit_card(self, alice_token, alice_account_id):
        resp = client.post(
            cards_path(),
            json={
                "account_id": alice_account_id,
                "card_type": "debit",
                "cardholder_name": "Alice Johnson",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["card_type"] == "debit"
        assert body["status"] == "inactive"  # starts inactive
        assert "last_four" in body

    def test_issue_credit_card(self, alice_token, alice_account_id):
        resp = cards_client.issue_card(
            {"account_id": alice_account_id, "card_type": "credit", "cardholder_name": "Alice J"},
            alice_token,
        )
        assert resp.status_code == 201
        assert resp.json()["card_type"] == "credit"

    def test_cardholder_name_uppercased(self, alice_token, alice_account_id):
        resp = cards_client.issue_card(
            {"account_id": alice_account_id, "card_type": "debit", "cardholder_name": "alice j"},
            alice_token,
        )
        assert resp.status_code == 201
        assert resp.json()["cardholder_name"] == "ALICE J"

    def test_card_for_closed_account_returns_400(self, alice_token):
        resp = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
        )
        closed_id = resp.json()["id"]
        accounts_client.delete_account(closed_id, alice_token)
        resp = cards_client.issue_card(
            {"account_id": closed_id, "card_type": "debit", "cardholder_name": "Test"},
            alice_token,
        )
        assert resp.status_code == 400

    def test_card_for_nonexistent_account_returns_404(self, alice_token):
        resp = cards_client.issue_card(
            {"account_id": "ghost-account", "card_type": "debit", "cardholder_name": "Test"},
            alice_token,
        )
        assert resp.status_code == 404

    def test_no_auth_returns_401(self, alice_account_id):
        resp = client.post(
            cards_path(),
            json={"account_id": alice_account_id, "card_type": "debit", "cardholder_name": "x"},
        )
        assert resp.status_code == 401

    def test_others_account_returns_403(self, alice_token, bob_account_id):
        resp = cards_client.issue_card(
            {"account_id": bob_account_id, "card_type": "debit", "cardholder_name": "x"},
            alice_token,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /cards/{card_id}
# ---------------------------------------------------------------------------


class TestGetCard:
    def test_get_card_by_id(self, alice_token, alice_card_id):
        resp = client.get(
            card_path(alice_card_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == alice_card_id

    def test_get_via_helper(self, alice_token, alice_card_id):
        resp = cards_client.get_card(alice_card_id, alice_token)
        assert resp.status_code == 200

    def test_not_found_returns_404(self, alice_token):
        resp = cards_client.get_card("ghost-card", alice_token)
        assert resp.status_code == 404

    def test_others_card_returns_403(self, alice_token, bob_token, bob_account_id):
        bob_card = cards_client.issue_card(
            {"account_id": bob_account_id, "card_type": "debit", "cardholder_name": "Bob"},
            bob_token,
        ).json()["id"]
        resp = cards_client.get_card(bob_card, alice_token)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_card_id):
        resp = client.get(card_path(alice_card_id))
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PUT /cards/{card_id}/status
# ---------------------------------------------------------------------------


class TestUpdateCardStatus:
    def test_activate_card(self, alice_token, alice_card_id):
        resp = client.put(
            card_status_path(alice_card_id),
            json={"status": "active"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_suspend_card(self, alice_token, alice_card_id):
        resp = cards_client.update_card_status(alice_card_id, {"status": "suspended"}, alice_token)
        assert resp.status_code == 200
        assert resp.json()["status"] == "suspended"

    def test_cannot_modify_cancelled_card(self, alice_token, alice_card_id):
        # Cancel the card
        cards_client.cancel_card(alice_card_id, alice_token)
        # Try to re-activate
        resp = cards_client.update_card_status(alice_card_id, {"status": "active"}, alice_token)
        assert resp.status_code == 400
        assert "cancelled" in resp.json()["error"].lower()

    def test_not_found_returns_404(self, alice_token):
        resp = cards_client.update_card_status("ghost-card", {"status": "active"}, alice_token)
        assert resp.status_code == 404

    def test_others_card_returns_403(self, alice_token, bob_token, bob_account_id):
        bob_card_id = cards_client.issue_card(
            {"account_id": bob_account_id, "card_type": "debit", "cardholder_name": "Bob"},
            bob_token,
        ).json()["id"]
        resp = cards_client.update_card_status(bob_card_id, {"status": "active"}, alice_token)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_card_id):
        resp = client.put(card_status_path(alice_card_id), json={"status": "active"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /cards/{card_id}
# ---------------------------------------------------------------------------


class TestCancelCard:
    def test_cancel_card_returns_204(self, alice_token, alice_card_id):
        resp = client.delete(
            card_path(alice_card_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 204

    def test_cancel_sets_status_cancelled(self, alice_token, alice_card_id):
        cards_client.cancel_card(alice_card_id, alice_token)
        resp = cards_client.get_card(alice_card_id, alice_token)
        assert resp.json()["status"] == "cancelled"

    def test_cancel_via_helper(self, alice_token, alice_card_id):
        resp = cards_client.cancel_card(alice_card_id, alice_token)
        assert resp.status_code == 204

    def test_not_found_returns_404(self, alice_token):
        resp = cards_client.cancel_card("ghost-card", alice_token)
        assert resp.status_code == 404

    def test_others_card_returns_403(self, alice_token, bob_token, bob_account_id):
        bob_card_id = cards_client.issue_card(
            {"account_id": bob_account_id, "card_type": "debit", "cardholder_name": "Bob"},
            bob_token,
        ).json()["id"]
        resp = cards_client.cancel_card(bob_card_id, alice_token)
        assert resp.status_code == 403

    def test_no_auth_returns_401(self, alice_card_id):
        resp = client.delete(card_path(alice_card_id))
        assert resp.status_code == 401
