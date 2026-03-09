"""
Test helper: wrapper client methods for the Financial Accounts API.

Provides typed helper classes that wrap the FastAPI TestClient, mapping
high-level operations to concrete HTTP calls.  Both the URL constants
and the client wrappers are used in tests so the analyzer can resolve
endpoint coverage both directly and via indirect method calls.

Usage in tests:
    from app.helpers.api_client import AuthClient, AccountsClient, ...
    from fastapi.testclient import TestClient
    from app.main import app

    http = TestClient(app)
    auth = AuthClient(http)
    accounts = AccountsClient(http)
    token = auth.get_token("alice", "alice123")
    resp = accounts.create_account({"account_type": "checking"}, token)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# URL constants (mirrors app/constants.py — kept here for test-layer clarity)
# ---------------------------------------------------------------------------

# Auth
AUTH_TOKEN_URL = "/auth/token"
AUTH_REFRESH_URL = "/auth/refresh"

# Accounts
ACCOUNTS_URL = "/accounts"
ACCOUNT_URL = "/accounts/{account_id}"
ACCOUNT_BALANCE_URL = "/accounts/{account_id}/balance"
ACCOUNT_SUMMARY_URL = "/accounts/{account_id}/summary"

# Transactions
TRANSACTIONS_URL = "/transactions"
TRANSACTION_URL = "/transactions/{transaction_id}"

# Transfers
TRANSFERS_URL = "/transfers"
TRANSFER_URL = "/transfers/{transfer_id}"

# Limits
LIMITS_URL = "/limits/{account_id}"

# Statements
STATEMENTS_URL = "/statements/{account_id}"
STATEMENT_MONTH_URL = "/statements/{account_id}/{month}"

# Cards
CARDS_URL = "/cards"
CARD_URL = "/cards/{card_id}"
CARD_STATUS_URL = "/cards/{card_id}/status"

# Merchants
MERCHANTS_URL = "/merchants"
MERCHANT_URL = "/merchants/{merchant_id}"

# Admin
ADMIN_HEALTH_URL = "/admin/health"
ADMIN_STATS_URL = "/admin/stats"


# ---------------------------------------------------------------------------
# Base client helpers
# ---------------------------------------------------------------------------


def _auth_headers(token: Optional[str]) -> Dict[str, str]:
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


# ---------------------------------------------------------------------------
# Auth client
# ---------------------------------------------------------------------------


class AuthClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def login(self, username: str, password: str):
        """POST /auth/token — returns full response."""
        return self._client.post(
            AUTH_TOKEN_URL,
            data={"username": username, "password": password},
        )

    def get_token(self, username: str, password: str) -> str:
        """Convenience: returns the access_token string directly."""
        resp = self.login(username, password)
        resp.raise_for_status()
        return resp.json()["access_token"]

    def refresh(self, refresh_token: str):
        """POST /auth/refresh."""
        return self._client.post(
            AUTH_REFRESH_URL,
            json={"refresh_token": refresh_token},
        )


# ---------------------------------------------------------------------------
# Accounts client
# ---------------------------------------------------------------------------


class AccountsClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def create_account(self, data: Dict[str, Any], token: str):
        """POST /accounts."""
        return self._client.post(
            ACCOUNTS_URL,
            json=data,
            headers=_auth_headers(token),
        )

    def list_accounts(self, token: str, page: int = 1, page_size: int = 20):
        """GET /accounts."""
        return self._client.get(
            ACCOUNTS_URL,
            params={"page": page, "page_size": page_size},
            headers=_auth_headers(token),
        )

    def get_account(self, account_id: str, token: str):
        """GET /accounts/{account_id}."""
        return self._client.get(
            ACCOUNT_URL.format(account_id=account_id),
            headers=_auth_headers(token),
        )

    def update_account(self, account_id: str, data: Dict[str, Any], token: str):
        """PUT /accounts/{account_id}."""
        return self._client.put(
            ACCOUNT_URL.format(account_id=account_id),
            json=data,
            headers=_auth_headers(token),
        )

    def delete_account(self, account_id: str, token: str):
        """DELETE /accounts/{account_id}."""
        return self._client.delete(
            ACCOUNT_URL.format(account_id=account_id),
            headers=_auth_headers(token),
        )

    def get_balance(self, account_id: str, token: str):
        """GET /accounts/{account_id}/balance."""
        return self._client.get(
            ACCOUNT_BALANCE_URL.format(account_id=account_id),
            headers=_auth_headers(token),
        )

    def get_summary(self, account_id: str, token: str):
        """GET /accounts/{account_id}/summary."""
        return self._client.get(
            ACCOUNT_SUMMARY_URL.format(account_id=account_id),
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Transactions client
# ---------------------------------------------------------------------------


class TransactionsClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def create_transaction(self, data: Dict[str, Any], token: str):
        """POST /transactions."""
        return self._client.post(
            TRANSACTIONS_URL,
            json=data,
            headers=_auth_headers(token),
        )

    def list_transactions(self, token: str, account_id: Optional[str] = None, page: int = 1):
        """GET /transactions."""
        params: Dict[str, Any] = {"page": page}
        if account_id:
            params["account_id"] = account_id
        return self._client.get(
            TRANSACTIONS_URL,
            params=params,
            headers=_auth_headers(token),
        )

    def get_transaction(self, transaction_id: str, token: str):
        """GET /transactions/{transaction_id}."""
        return self._client.get(
            TRANSACTION_URL.format(transaction_id=transaction_id),
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Transfers client
# ---------------------------------------------------------------------------


class TransfersClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def create_transfer(self, data: Dict[str, Any], token: str):
        """POST /transfers."""
        return self._client.post(
            TRANSFERS_URL,
            json=data,
            headers=_auth_headers(token),
        )

    def get_transfer(self, transfer_id: str, token: str):
        """GET /transfers/{transfer_id}."""
        return self._client.get(
            TRANSFER_URL.format(transfer_id=transfer_id),
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Limits client
# ---------------------------------------------------------------------------


class LimitsClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def get_limits(self, account_id: str, token: str):
        """GET /limits/{account_id}."""
        return self._client.get(
            LIMITS_URL.format(account_id=account_id),
            headers=_auth_headers(token),
        )

    def update_limits(self, account_id: str, data: Dict[str, Any], token: str):
        """PUT /limits/{account_id}."""
        return self._client.put(
            LIMITS_URL.format(account_id=account_id),
            json=data,
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Statements client
# ---------------------------------------------------------------------------


class StatementsClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def list_statements(self, account_id: str, token: str):
        """GET /statements/{account_id}."""
        return self._client.get(
            STATEMENTS_URL.format(account_id=account_id),
            headers=_auth_headers(token),
        )

    def get_statement(self, account_id: str, month: str, token: str):
        """GET /statements/{account_id}/{month}."""
        return self._client.get(
            STATEMENT_MONTH_URL.format(account_id=account_id, month=month),
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Cards client
# ---------------------------------------------------------------------------


class CardsClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def issue_card(self, data: Dict[str, Any], token: str):
        """POST /cards."""
        return self._client.post(
            CARDS_URL,
            json=data,
            headers=_auth_headers(token),
        )

    def get_card(self, card_id: str, token: str):
        """GET /cards/{card_id}."""
        return self._client.get(
            CARD_URL.format(card_id=card_id),
            headers=_auth_headers(token),
        )

    def update_card_status(self, card_id: str, data: Dict[str, Any], token: str):
        """PUT /cards/{card_id}/status."""
        return self._client.put(
            CARD_STATUS_URL.format(card_id=card_id),
            json=data,
            headers=_auth_headers(token),
        )

    def cancel_card(self, card_id: str, token: str):
        """DELETE /cards/{card_id}."""
        return self._client.delete(
            CARD_URL.format(card_id=card_id),
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Merchants client
# ---------------------------------------------------------------------------


class MerchantsClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def list_merchants(self, token: str, page: int = 1):
        """GET /merchants."""
        return self._client.get(
            MERCHANTS_URL,
            params={"page": page},
            headers=_auth_headers(token),
        )

    def get_merchant(self, merchant_id: str, token: str):
        """GET /merchants/{merchant_id}."""
        return self._client.get(
            MERCHANT_URL.format(merchant_id=merchant_id),
            headers=_auth_headers(token),
        )


# ---------------------------------------------------------------------------
# Admin client
# ---------------------------------------------------------------------------


class AdminClient:
    def __init__(self, client: TestClient) -> None:
        self._client = client

    def health(self, token: str):
        """GET /admin/health."""
        return self._client.get(
            ADMIN_HEALTH_URL,
            headers=_auth_headers(token),
        )

    def stats(self, token: str):
        """GET /admin/stats."""
        return self._client.get(
            ADMIN_STATS_URL,
            headers=_auth_headers(token),
        )
