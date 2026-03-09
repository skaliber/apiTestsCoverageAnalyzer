"""
tests-complete/test_transfers.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Full coverage: all transfer endpoints + business rules.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import AccountsClient, AuthClient, TransfersClient
from app.helpers.path_builder import transfer_path, transfers_path
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)
transfers_client = TransfersClient(client)


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
def alice_checking_id(alice_token) -> str:
    accounts = accounts_client.list_accounts(alice_token).json()["items"]
    for acct in accounts:
        if acct["account_type"] == "checking":
            return acct["id"]
    return accounts[0]["id"]


@pytest.fixture
def alice_savings_id(alice_token) -> str:
    accounts = accounts_client.list_accounts(alice_token).json()["items"]
    for acct in accounts:
        if acct["account_type"] == "savings":
            return acct["id"]
    return accounts[0]["id"]


@pytest.fixture
def bob_account_id(bob_token) -> str:
    return accounts_client.list_accounts(bob_token).json()["items"][0]["id"]


# ---------------------------------------------------------------------------
# POST /transfers
# ---------------------------------------------------------------------------


class TestCreateTransfer:
    def test_transfer_between_own_accounts(self, alice_token, alice_checking_id, alice_savings_id):
        resp = client.post(
            transfers_path(),
            json={
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "100.00",
                "description": "Move to savings",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "completed"
        assert float(body["amount"]) == 100.00

    def test_transfer_reduces_source_balance(self, alice_token, alice_checking_id, alice_savings_id):
        before = float(accounts_client.get_account(alice_checking_id, alice_token).json()["available_balance"])
        transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "200.00",
                "description": "Balance test",
            },
            alice_token,
        )
        after = float(accounts_client.get_account(alice_checking_id, alice_token).json()["available_balance"])
        assert after == before - 200.00

    def test_transfer_increases_destination_balance(self, alice_token, alice_checking_id, alice_savings_id):
        before = float(accounts_client.get_account(alice_savings_id, alice_token).json()["available_balance"])
        transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "150.00",
                "description": "Dest balance test",
            },
            alice_token,
        )
        after = float(accounts_client.get_account(alice_savings_id, alice_token).json()["available_balance"])
        assert after == before + 150.00

    def test_insufficient_funds_returns_400(self, alice_token, alice_savings_id, bob_account_id):
        resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_savings_id,
                "destination_account_id": bob_account_id,
                "amount": "9999999.00",
                "description": "Way too much",
            },
            alice_token,
        )
        assert resp.status_code == 400
        assert "insufficient" in resp.json()["error"].lower()

    def test_minimum_transfer_amount_enforced(self, alice_token, alice_checking_id, alice_savings_id):
        resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "0.50",
                "description": "Below minimum",
            },
            alice_token,
        )
        assert resp.status_code == 400
        assert "minimum" in resp.json()["error"].lower()

    def test_source_not_found_returns_404(self, alice_token, alice_savings_id):
        resp = transfers_client.create_transfer(
            {
                "source_account_id": "ghost-src",
                "destination_account_id": alice_savings_id,
                "amount": "100.00",
                "description": "Ghost source",
            },
            alice_token,
        )
        assert resp.status_code == 404

    def test_destination_not_found_returns_404(self, alice_token, alice_checking_id):
        resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": "ghost-dst",
                "amount": "100.00",
                "description": "Ghost dest",
            },
            alice_token,
        )
        assert resp.status_code == 404

    def test_cannot_transfer_from_others_account(self, alice_token, bob_token, bob_account_id, alice_savings_id):
        resp = transfers_client.create_transfer(
            {
                "source_account_id": bob_account_id,
                "destination_account_id": alice_savings_id,
                "amount": "100.00",
                "description": "Steal from Bob",
            },
            alice_token,
        )
        assert resp.status_code == 403

    def test_suspended_source_returns_400(self, alice_token, alice_checking_id, alice_savings_id):
        accounts_client.update_account(alice_checking_id, {"status": "suspended"}, alice_token)
        resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "100.00",
                "description": "Suspended source",
            },
            alice_token,
        )
        assert resp.status_code == 400
        assert "suspended" in resp.json()["error"].lower()

    def test_no_auth_returns_401(self, alice_checking_id, alice_savings_id):
        resp = client.post(
            transfers_path(),
            json={
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "50.00",
                "description": "Unauth",
            },
        )
        assert resp.status_code == 401

    def test_idempotent_transfer(self, alice_token, alice_checking_id, alice_savings_id):
        payload = {
            "source_account_id": alice_checking_id,
            "destination_account_id": alice_savings_id,
            "amount": "25.00",
            "description": "Idempotent",
            "idempotency_key": "tr-idem-001",
        }
        resp1 = transfers_client.create_transfer(payload, alice_token)
        resp2 = transfers_client.create_transfer(payload, alice_token)
        assert resp1.json()["id"] == resp2.json()["id"]


# ---------------------------------------------------------------------------
# GET /transfers/{transfer_id}
# ---------------------------------------------------------------------------


class TestGetTransfer:
    def test_get_transfer_by_id(self, alice_token, alice_checking_id, alice_savings_id):
        create_resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "50.00",
                "description": "Get test",
            },
            alice_token,
        )
        transfer_id = create_resp.json()["id"]

        resp = client.get(
            transfer_path(transfer_id),
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == transfer_id

    def test_get_via_helper(self, alice_token, alice_checking_id, alice_savings_id):
        create_resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_checking_id,
                "destination_account_id": alice_savings_id,
                "amount": "30.00",
                "description": "Helper test",
            },
            alice_token,
        )
        transfer_id = create_resp.json()["id"]
        resp = transfers_client.get_transfer(transfer_id, alice_token)
        assert resp.status_code == 200

    def test_not_found_returns_404(self, alice_token):
        resp = transfers_client.get_transfer("ghost-transfer", alice_token)
        assert resp.status_code == 404

    def test_no_auth_returns_401(self):
        resp = client.get(transfer_path("some-id"))
        assert resp.status_code == 401
