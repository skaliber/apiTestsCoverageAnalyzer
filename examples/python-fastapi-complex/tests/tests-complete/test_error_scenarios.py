"""
tests-complete/test_error_scenarios.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Comprehensive error scenario tests: validates that all endpoints
return the correct HTTP error codes and error message bodies
under adverse conditions.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import reset_database
from app.helpers.api_client import (
    AccountsClient,
    AuthClient,
    CardsClient,
    LimitsClient,
    MerchantsClient,
    StatementsClient,
    TransactionsClient,
    TransfersClient,
)
from app.main import app

client = TestClient(app)
auth_client = AuthClient(client)
accounts_client = AccountsClient(client)
txn_client = TransactionsClient(client)
transfers_client = TransfersClient(client)
limits_client = LimitsClient(client)
statements_client = StatementsClient(client)
cards_client = CardsClient(client)
merchants_client = MerchantsClient(client)


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


# ---------------------------------------------------------------------------
# 404 not found scenarios
# ---------------------------------------------------------------------------


class TestNotFoundErrors:
    def test_account_not_found(self, alice_token):
        resp = accounts_client.get_account("no-such-account", alice_token)
        assert resp.status_code == 404
        assert "error" in resp.json()

    def test_transaction_not_found(self, alice_token):
        resp = txn_client.get_transaction("no-such-txn", alice_token)
        assert resp.status_code == 404

    def test_transfer_not_found(self, alice_token):
        resp = transfers_client.get_transfer("no-such-transfer", alice_token)
        assert resp.status_code == 404

    def test_limits_account_not_found(self, alice_token):
        resp = limits_client.get_limits("no-such-account", alice_token)
        assert resp.status_code == 404

    def test_statements_account_not_found(self, alice_token):
        resp = statements_client.list_statements("no-such-account", alice_token)
        assert resp.status_code == 404

    def test_card_not_found(self, alice_token):
        resp = cards_client.get_card("no-such-card", alice_token)
        assert resp.status_code == 404

    def test_merchant_not_found(self, alice_token):
        resp = merchants_client.get_merchant("no-such-merchant", alice_token)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 403 forbidden scenarios
# ---------------------------------------------------------------------------


class TestForbiddenErrors:
    def test_alice_cannot_access_bobs_account(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.get_account(bob_id, alice_token)
        assert resp.status_code == 403

    def test_alice_cannot_update_bobs_account(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.update_account(bob_id, {"nickname": "x"}, alice_token)
        assert resp.status_code == 403

    def test_alice_cannot_delete_bobs_account(self, alice_token, bob_token):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = accounts_client.delete_account(bob_id, alice_token)
        assert resp.status_code == 403

    def test_alice_cannot_transfer_from_bobs_account(self, alice_token, bob_token, alice_account_id):
        bob_id = accounts_client.list_accounts(bob_token).json()["items"][0]["id"]
        resp = transfers_client.create_transfer(
            {
                "source_account_id": bob_id,
                "destination_account_id": alice_account_id,
                "amount": "100.00",
                "description": "Unauthorized",
            },
            alice_token,
        )
        assert resp.status_code == 403

    def test_non_admin_cannot_access_stats(self, alice_token):
        resp = client.get("/admin/stats", headers={"Authorization": f"Bearer {alice_token}"})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 400 business-rule violation scenarios
# ---------------------------------------------------------------------------


class TestBusinessRuleErrors:
    def test_transfer_below_minimum(self, alice_token, alice_account_id):
        savings_id = accounts_client.list_accounts(alice_token).json()["items"][1]["id"]
        resp = transfers_client.create_transfer(
            {
                "source_account_id": alice_account_id,
                "destination_account_id": savings_id,
                "amount": "0.01",
                "description": "Below minimum",
            },
            alice_token,
        )
        assert resp.status_code == 400

    def test_close_account_with_balance(self, alice_token, alice_account_id):
        resp = accounts_client.delete_account(alice_account_id, alice_token)
        assert resp.status_code == 400

    def test_debit_with_insufficient_funds(self, alice_token):
        empty_id = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
        ).json()["id"]
        resp = txn_client.create_transaction(
            {
                "account_id": empty_id,
                "amount": "9999.00",
                "transaction_type": "debit",
                "description": "Overdraft",
            },
            alice_token,
        )
        assert resp.status_code == 400

    def test_transaction_on_suspended_account(self, alice_token, alice_account_id):
        accounts_client.update_account(alice_account_id, {"status": "suspended"}, alice_token)
        resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "10.00",
                "transaction_type": "credit",
                "description": "Try on suspended",
            },
            alice_token,
        )
        assert resp.status_code == 400

    def test_transfer_from_closed_account(self, alice_token):
        empty_id = accounts_client.create_account(
            {"account_type": "checking", "initial_deposit": "0.00"}, alice_token
        ).json()["id"]
        accounts_client.delete_account(empty_id, alice_token)
        savings_id = accounts_client.list_accounts(alice_token).json()["items"][0]["id"]
        resp = transfers_client.create_transfer(
            {
                "source_account_id": empty_id,
                "destination_account_id": savings_id,
                "amount": "100.00",
                "description": "Transfer from closed",
            },
            alice_token,
        )
        assert resp.status_code == 400

    def test_statement_invalid_month_format(self, alice_token, alice_account_id):
        resp = statements_client.get_statement(alice_account_id, "bad-month", alice_token)
        assert resp.status_code == 400

    def test_cancel_then_modify_card_returns_400(self, alice_token, alice_account_id):
        card_id = cards_client.issue_card(
            {"account_id": alice_account_id, "card_type": "debit", "cardholder_name": "Alice"},
            alice_token,
        ).json()["id"]
        cards_client.cancel_card(card_id, alice_token)
        resp = cards_client.update_card_status(card_id, {"status": "active"}, alice_token)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 422 validation error scenarios
# ---------------------------------------------------------------------------


class TestValidationErrors:
    def test_create_account_missing_type(self, alice_token):
        resp = client.post(
            "/accounts",
            json={"initial_deposit": "100.00"},
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 422

    def test_create_transaction_missing_amount(self, alice_token, alice_account_id):
        resp = client.post(
            "/transactions",
            json={
                "account_id": alice_account_id,
                "transaction_type": "credit",
                "description": "No amount",
            },
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert resp.status_code == 422

    def test_create_transaction_negative_amount(self, alice_token, alice_account_id):
        resp = txn_client.create_transaction(
            {
                "account_id": alice_account_id,
                "amount": "-50.00",
                "transaction_type": "credit",
                "description": "Negative",
            },
            alice_token,
        )
        assert resp.status_code == 422

    def test_update_limit_zero_amount(self, alice_token, alice_account_id):
        resp = limits_client.update_limits(
            alice_account_id,
            {"limit_type": "daily_transfer", "amount": "0.00"},
            alice_token,
        )
        assert resp.status_code == 422
