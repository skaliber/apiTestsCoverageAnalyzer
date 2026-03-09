"""
Path building helpers for the Financial Accounts API.

Provides functions that construct URL paths from parameters.
Used in both application code and test utilities to avoid
hard-coding path strings in multiple places.
"""

from __future__ import annotations

from app.constants import (
    ACCOUNT_BALANCE,
    ACCOUNT_BY_ID,
    ACCOUNT_SUMMARY,
    ACCOUNTS_BASE,
    ADMIN_HEALTH,
    ADMIN_STATS,
    AUTH_REFRESH_URL,
    AUTH_TOKEN_URL,
    CARD_BY_ID,
    CARD_STATUS,
    CARDS_BASE,
    LIMITS_BY_ACCOUNT,
    MERCHANT_BY_ID,
    MERCHANTS_BASE,
    STATEMENT_BY_MONTH,
    STATEMENTS_BY_ACCOUNT,
    TRANSACTION_BY_ID,
    TRANSACTIONS_BASE,
    TRANSFER_BY_ID,
    TRANSFERS_BASE,
)


# ---------------------------------------------------------------------------
# Auth paths
# ---------------------------------------------------------------------------


def auth_token_path() -> str:
    """Return the path for obtaining a token: /auth/token."""
    return AUTH_TOKEN_URL


def auth_refresh_path() -> str:
    """Return the path for refreshing a token: /auth/refresh."""
    return AUTH_REFRESH_URL


# ---------------------------------------------------------------------------
# Account paths
# ---------------------------------------------------------------------------


def accounts_path() -> str:
    """Return the accounts collection path: /accounts."""
    return ACCOUNTS_BASE


def account_path(account_id: str) -> str:
    """Return the path for a specific account: /accounts/{account_id}."""
    return ACCOUNT_BY_ID.format(account_id=account_id)


def account_balance_path(account_id: str) -> str:
    """Return the balance path for an account: /accounts/{account_id}/balance."""
    return ACCOUNT_BALANCE.format(account_id=account_id)


def account_summary_path(account_id: str) -> str:
    """Return the summary path for an account: /accounts/{account_id}/summary."""
    return ACCOUNT_SUMMARY.format(account_id=account_id)


# ---------------------------------------------------------------------------
# Transaction paths
# ---------------------------------------------------------------------------


def transactions_path() -> str:
    """Return the transactions collection path: /transactions."""
    return TRANSACTIONS_BASE


def transaction_path(transaction_id: str) -> str:
    """Return the path for a specific transaction: /transactions/{transaction_id}."""
    return TRANSACTION_BY_ID.format(transaction_id=transaction_id)


# ---------------------------------------------------------------------------
# Transfer paths
# ---------------------------------------------------------------------------


def transfers_path() -> str:
    """Return the transfers collection path: /transfers."""
    return TRANSFERS_BASE


def transfer_path(transfer_id: str) -> str:
    """Return the path for a specific transfer: /transfers/{transfer_id}."""
    return TRANSFER_BY_ID.format(transfer_id=transfer_id)


# ---------------------------------------------------------------------------
# Limits paths
# ---------------------------------------------------------------------------


def limits_path(account_id: str) -> str:
    """Return the limits path for an account: /limits/{account_id}."""
    return LIMITS_BY_ACCOUNT.format(account_id=account_id)


# ---------------------------------------------------------------------------
# Statement paths
# ---------------------------------------------------------------------------


def statements_path(account_id: str) -> str:
    """Return the statements list path: /statements/{account_id}."""
    return STATEMENTS_BY_ACCOUNT.format(account_id=account_id)


def statement_month_path(account_id: str, month: str) -> str:
    """Return the statement path for a specific month: /statements/{account_id}/{month}."""
    return STATEMENT_BY_MONTH.format(account_id=account_id, month=month)


# ---------------------------------------------------------------------------
# Card paths
# ---------------------------------------------------------------------------


def cards_path() -> str:
    """Return the cards collection path: /cards."""
    return CARDS_BASE


def card_path(card_id: str) -> str:
    """Return the path for a specific card: /cards/{card_id}."""
    return CARD_BY_ID.format(card_id=card_id)


def card_status_path(card_id: str) -> str:
    """Return the status update path for a card: /cards/{card_id}/status."""
    return CARD_STATUS.format(card_id=card_id)


# ---------------------------------------------------------------------------
# Merchant paths
# ---------------------------------------------------------------------------


def merchants_path() -> str:
    """Return the merchants collection path: /merchants."""
    return MERCHANTS_BASE


def merchant_path(merchant_id: str) -> str:
    """Return the path for a specific merchant: /merchants/{merchant_id}."""
    return MERCHANT_BY_ID.format(merchant_id=merchant_id)


# ---------------------------------------------------------------------------
# Admin paths
# ---------------------------------------------------------------------------


def admin_health_path() -> str:
    """Return the health check path: /admin/health."""
    return ADMIN_HEALTH


def admin_stats_path() -> str:
    """Return the system stats path: /admin/stats."""
    return ADMIN_STATS
