"""
In-memory database for the Financial Accounts API.
Uses simple dictionaries backed by threading locks for thread safety.
Suitable for development and testing; swap for a real DB in production.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional
from uuid import uuid4

from app.constants import (
    AccountStatus,
    AccountType,
    CardStatus,
    CardType,
    LimitType,
    StatementStatus,
    TransactionStatus,
    TransactionType,
    TransferStatus,
    DEFAULT_DAILY_TRANSFER_LIMIT,
    DEFAULT_SINGLE_TRANSACTION_LIMIT,
    DEFAULT_MONTHLY_SPENDING_LIMIT,
    DEFAULT_ATM_WITHDRAWAL_LIMIT,
)

_APP_START = time.monotonic()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid4())


# ---------------------------------------------------------------------------
# In-memory stores
# ---------------------------------------------------------------------------

_lock = threading.RLock()

_users: Dict[str, dict] = {}
_accounts: Dict[str, dict] = {}
_transactions: Dict[str, dict] = {}
_transfers: Dict[str, dict] = {}
_limits: Dict[str, List[dict]] = {}
_cards: Dict[str, dict] = {}
_merchants: Dict[str, dict] = {}
_refresh_tokens: Dict[str, str] = {}  # token -> user_id


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------


def seed_data() -> None:
    """Populate the in-memory database with initial seed data."""
    with _lock:
        from passlib.context import CryptContext

        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

        # Users
        admin_id = "user-admin-001"
        alice_id = "user-alice-001"
        bob_id = "user-bob-001"

        _users[admin_id] = {
            "id": admin_id,
            "username": "admin",
            "email": "admin@finapi.example.com",
            "full_name": "System Administrator",
            "hashed_password": pwd_ctx.hash("admin123"),
            "is_active": True,
            "scopes": ["admin", "read", "write"],
            "created_at": _now(),
        }
        _users[alice_id] = {
            "id": alice_id,
            "username": "alice",
            "email": "alice@example.com",
            "full_name": "Alice Johnson",
            "hashed_password": pwd_ctx.hash("alice123"),
            "is_active": True,
            "scopes": ["read", "write"],
            "created_at": _now(),
        }
        _users[bob_id] = {
            "id": bob_id,
            "username": "bob",
            "email": "bob@example.com",
            "full_name": "Bob Smith",
            "hashed_password": pwd_ctx.hash("bob123"),
            "is_active": True,
            "scopes": ["read", "write"],
            "created_at": _now(),
        }

        # Accounts
        acct1_id = "acct-alice-checking-001"
        acct2_id = "acct-alice-savings-001"
        acct3_id = "acct-bob-checking-001"

        _accounts[acct1_id] = {
            "id": acct1_id,
            "owner_id": alice_id,
            "account_number": "1000000001",
            "account_type": AccountType.CHECKING,
            "status": AccountStatus.ACTIVE,
            "currency": "USD",
            "available_balance": Decimal("5000.00"),
            "current_balance": Decimal("5000.00"),
            "nickname": "Alice Checking",
            "created_at": _now(),
            "updated_at": _now(),
        }
        _accounts[acct2_id] = {
            "id": acct2_id,
            "owner_id": alice_id,
            "account_number": "1000000002",
            "account_type": AccountType.SAVINGS,
            "status": AccountStatus.ACTIVE,
            "currency": "USD",
            "available_balance": Decimal("12000.00"),
            "current_balance": Decimal("12000.00"),
            "nickname": "Alice Savings",
            "created_at": _now(),
            "updated_at": _now(),
        }
        _accounts[acct3_id] = {
            "id": acct3_id,
            "owner_id": bob_id,
            "account_number": "1000000003",
            "account_type": AccountType.CHECKING,
            "status": AccountStatus.ACTIVE,
            "currency": "USD",
            "available_balance": Decimal("3200.00"),
            "current_balance": Decimal("3200.00"),
            "nickname": "Bob Checking",
            "created_at": _now(),
            "updated_at": _now(),
        }

        # Default limits for each account
        for acct_id in [acct1_id, acct2_id, acct3_id]:
            _limits[acct_id] = [
                {
                    "limit_type": LimitType.DAILY_TRANSFER,
                    "amount": Decimal(str(DEFAULT_DAILY_TRANSFER_LIMIT)),
                    "used_today": Decimal("0.00"),
                    "reset_at": _now(),
                },
                {
                    "limit_type": LimitType.SINGLE_TRANSACTION,
                    "amount": Decimal(str(DEFAULT_SINGLE_TRANSACTION_LIMIT)),
                    "used_today": Decimal("0.00"),
                    "reset_at": _now(),
                },
                {
                    "limit_type": LimitType.MONTHLY_SPENDING,
                    "amount": Decimal(str(DEFAULT_MONTHLY_SPENDING_LIMIT)),
                    "used_today": Decimal("0.00"),
                    "reset_at": _now(),
                },
                {
                    "limit_type": LimitType.ATM_WITHDRAWAL,
                    "amount": Decimal(str(DEFAULT_ATM_WITHDRAWAL_LIMIT)),
                    "used_today": Decimal("0.00"),
                    "reset_at": _now(),
                },
            ]

        # Transactions
        txn1_id = "txn-001"
        txn2_id = "txn-002"
        _transactions[txn1_id] = {
            "id": txn1_id,
            "account_id": acct1_id,
            "amount": Decimal("200.00"),
            "transaction_type": TransactionType.CREDIT,
            "status": TransactionStatus.COMPLETED,
            "description": "Initial deposit",
            "idempotency_key": "initial-deposit-alice",
            "merchant_id": None,
            "metadata": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        _transactions[txn2_id] = {
            "id": txn2_id,
            "account_id": acct1_id,
            "amount": Decimal("50.00"),
            "transaction_type": TransactionType.DEBIT,
            "status": TransactionStatus.COMPLETED,
            "description": "Coffee shop purchase",
            "idempotency_key": None,
            "merchant_id": "merch-001",
            "metadata": {"category": "food_and_drink"},
            "created_at": _now(),
            "updated_at": _now(),
        }

        # Cards
        card1_id = "card-alice-debit-001"
        _cards[card1_id] = {
            "id": card1_id,
            "account_id": acct1_id,
            "card_type": CardType.DEBIT,
            "status": CardStatus.ACTIVE,
            "cardholder_name": "ALICE JOHNSON",
            "last_four": "4242",
            "expiry_month": 12,
            "expiry_year": 2027,
            "created_at": _now(),
            "updated_at": _now(),
        }

        # Merchants
        _merchants["merch-001"] = {
            "id": "merch-001",
            "name": "Blue Bottle Coffee",
            "category": "food_and_drink",
            "mcc_code": "5812",
            "country": "US",
            "is_active": True,
        }
        _merchants["merch-002"] = {
            "id": "merch-002",
            "name": "Amazon",
            "category": "online_retail",
            "mcc_code": "5999",
            "country": "US",
            "is_active": True,
        }
        _merchants["merch-003"] = {
            "id": "merch-003",
            "name": "Shell Gas Station",
            "category": "gas_station",
            "mcc_code": "5541",
            "country": "US",
            "is_active": True,
        }


# ---------------------------------------------------------------------------
# User operations
# ---------------------------------------------------------------------------


def get_user_by_username(username: str) -> Optional[dict]:
    with _lock:
        for user in _users.values():
            if user["username"] == username:
                return dict(user)
        return None


def get_user_by_id(user_id: str) -> Optional[dict]:
    with _lock:
        user = _users.get(user_id)
        return dict(user) if user else None


# ---------------------------------------------------------------------------
# Account operations
# ---------------------------------------------------------------------------


def create_account(owner_id: str, data: dict) -> dict:
    with _lock:
        acct_id = f"acct-{_uid()[:8]}"
        acct_number = str(len(_accounts) + 2000000000).zfill(10)
        now = _now()
        record = {
            "id": acct_id,
            "owner_id": owner_id,
            "account_number": acct_number,
            "account_type": data["account_type"],
            "status": AccountStatus.ACTIVE,
            "currency": data.get("currency", "USD"),
            "available_balance": Decimal(str(data.get("initial_deposit", "0.00"))),
            "current_balance": Decimal(str(data.get("initial_deposit", "0.00"))),
            "nickname": data.get("nickname"),
            "created_at": now,
            "updated_at": now,
        }
        _accounts[acct_id] = record
        # Initialize default limits
        _limits[acct_id] = [
            {
                "limit_type": LimitType.DAILY_TRANSFER,
                "amount": Decimal(str(DEFAULT_DAILY_TRANSFER_LIMIT)),
                "used_today": Decimal("0.00"),
                "reset_at": now,
            },
            {
                "limit_type": LimitType.SINGLE_TRANSACTION,
                "amount": Decimal(str(DEFAULT_SINGLE_TRANSACTION_LIMIT)),
                "used_today": Decimal("0.00"),
                "reset_at": now,
            },
            {
                "limit_type": LimitType.MONTHLY_SPENDING,
                "amount": Decimal(str(DEFAULT_MONTHLY_SPENDING_LIMIT)),
                "used_today": Decimal("0.00"),
                "reset_at": now,
            },
            {
                "limit_type": LimitType.ATM_WITHDRAWAL,
                "amount": Decimal(str(DEFAULT_ATM_WITHDRAWAL_LIMIT)),
                "used_today": Decimal("0.00"),
                "reset_at": now,
            },
        ]
        return dict(record)


def get_account(account_id: str) -> Optional[dict]:
    with _lock:
        acct = _accounts.get(account_id)
        return dict(acct) if acct else None


def list_accounts(owner_id: str, page: int = 1, page_size: int = 20) -> tuple[List[dict], int]:
    with _lock:
        owned = [dict(a) for a in _accounts.values() if a["owner_id"] == owner_id]
        total = len(owned)
        start = (page - 1) * page_size
        return owned[start : start + page_size], total


def update_account(account_id: str, updates: dict) -> Optional[dict]:
    with _lock:
        acct = _accounts.get(account_id)
        if not acct:
            return None
        for k, v in updates.items():
            if v is not None:
                acct[k] = v
        acct["updated_at"] = _now()
        return dict(acct)


def delete_account(account_id: str) -> bool:
    with _lock:
        if account_id not in _accounts:
            return False
        _accounts[account_id]["status"] = AccountStatus.CLOSED
        _accounts[account_id]["updated_at"] = _now()
        return True


# ---------------------------------------------------------------------------
# Transaction operations
# ---------------------------------------------------------------------------


def create_transaction(data: dict) -> dict:
    with _lock:
        # Idempotency check
        if data.get("idempotency_key"):
            for txn in _transactions.values():
                if txn["idempotency_key"] == data["idempotency_key"]:
                    return dict(txn)
        txn_id = f"txn-{_uid()[:8]}"
        now = _now()
        record = {
            "id": txn_id,
            "account_id": data["account_id"],
            "amount": Decimal(str(data["amount"])),
            "transaction_type": data["transaction_type"],
            "status": TransactionStatus.COMPLETED,
            "description": data["description"],
            "idempotency_key": data.get("idempotency_key"),
            "merchant_id": data.get("merchant_id"),
            "metadata": data.get("metadata"),
            "created_at": now,
            "updated_at": now,
        }
        _transactions[txn_id] = record
        # Update account balance
        acct = _accounts.get(data["account_id"])
        if acct:
            amount = Decimal(str(data["amount"]))
            if data["transaction_type"] in (TransactionType.CREDIT, TransactionType.INTEREST):
                acct["available_balance"] += amount
                acct["current_balance"] += amount
            else:
                acct["available_balance"] -= amount
                acct["current_balance"] -= amount
            acct["updated_at"] = now
        return dict(record)


def get_transaction(transaction_id: str) -> Optional[dict]:
    with _lock:
        txn = _transactions.get(transaction_id)
        return dict(txn) if txn else None


def list_transactions(
    account_id: Optional[str] = None, page: int = 1, page_size: int = 20
) -> tuple[List[dict], int]:
    with _lock:
        items = [dict(t) for t in _transactions.values()]
        if account_id:
            items = [t for t in items if t["account_id"] == account_id]
        total = len(items)
        # Sort by created_at descending
        items.sort(key=lambda x: x["created_at"], reverse=True)
        start = (page - 1) * page_size
        return items[start : start + page_size], total


# ---------------------------------------------------------------------------
# Transfer operations
# ---------------------------------------------------------------------------


def create_transfer(data: dict) -> dict:
    with _lock:
        if data.get("idempotency_key"):
            for tr in _transfers.values():
                if tr["idempotency_key"] == data["idempotency_key"]:
                    return dict(tr)
        transfer_id = f"tr-{_uid()[:8]}"
        now = _now()
        amount = Decimal(str(data["amount"]))
        fee = Decimal("0.00")

        # Debit source, credit destination
        src = _accounts.get(data["source_account_id"])
        dst = _accounts.get(data["destination_account_id"])
        if src:
            src["available_balance"] -= amount
            src["current_balance"] -= amount
            src["updated_at"] = now
        if dst:
            dst["available_balance"] += amount
            dst["current_balance"] += amount
            dst["updated_at"] = now

        record = {
            "id": transfer_id,
            "source_account_id": data["source_account_id"],
            "destination_account_id": data["destination_account_id"],
            "amount": amount,
            "description": data["description"],
            "status": TransferStatus.COMPLETED,
            "idempotency_key": data.get("idempotency_key"),
            "fee": fee,
            "created_at": now,
            "updated_at": now,
        }
        _transfers[transfer_id] = record
        return dict(record)


def get_transfer(transfer_id: str) -> Optional[dict]:
    with _lock:
        tr = _transfers.get(transfer_id)
        return dict(tr) if tr else None


# ---------------------------------------------------------------------------
# Limits operations
# ---------------------------------------------------------------------------


def get_limits(account_id: str) -> Optional[List[dict]]:
    with _lock:
        limits = _limits.get(account_id)
        return [dict(lim) for lim in limits] if limits is not None else None


def update_limit(account_id: str, limit_type: LimitType, amount: Decimal) -> Optional[List[dict]]:
    with _lock:
        limits = _limits.get(account_id)
        if limits is None:
            return None
        for lim in limits:
            if lim["limit_type"] == limit_type:
                lim["amount"] = amount
                lim["reset_at"] = _now()
                break
        return [dict(lim) for lim in limits]


# ---------------------------------------------------------------------------
# Statement operations
# ---------------------------------------------------------------------------


def get_statements(account_id: str) -> Optional[List[dict]]:
    with _lock:
        if account_id not in _accounts:
            return None
        months: Dict[str, dict] = {}
        for txn in _transactions.values():
            if txn["account_id"] != account_id:
                continue
            month_key = txn["created_at"].strftime("%Y-%m")
            if month_key not in months:
                months[month_key] = {
                    "month": month_key,
                    "status": StatementStatus.AVAILABLE,
                    "closing_balance": Decimal("0.00"),
                    "total_transactions": 0,
                }
            months[month_key]["total_transactions"] += 1
        return list(months.values())


def get_statement_by_month(account_id: str, month: str) -> Optional[dict]:
    with _lock:
        if account_id not in _accounts:
            return None
        entries = []
        total_credits = Decimal("0.00")
        total_debits = Decimal("0.00")
        for txn in _transactions.values():
            if txn["account_id"] != account_id:
                continue
            if txn["created_at"].strftime("%Y-%m") != month:
                continue
            entries.append(
                {
                    "date": txn["created_at"].strftime("%Y-%m-%d"),
                    "description": txn["description"],
                    "amount": txn["amount"],
                    "balance": Decimal("0.00"),  # simplified
                    "transaction_type": txn["transaction_type"],
                }
            )
            if txn["transaction_type"] in (TransactionType.CREDIT, TransactionType.INTEREST):
                total_credits += txn["amount"]
            else:
                total_debits += txn["amount"]

        return {
            "account_id": account_id,
            "month": month,
            "status": StatementStatus.AVAILABLE,
            "opening_balance": Decimal("0.00"),
            "closing_balance": total_credits - total_debits,
            "total_credits": total_credits,
            "total_debits": total_debits,
            "entries": entries,
            "generated_at": _now(),
        }


# ---------------------------------------------------------------------------
# Card operations
# ---------------------------------------------------------------------------


def create_card(data: dict) -> dict:
    with _lock:
        card_id = f"card-{_uid()[:8]}"
        now = _now()
        record = {
            "id": card_id,
            "account_id": data["account_id"],
            "card_type": data["card_type"],
            "status": CardStatus.INACTIVE,
            "cardholder_name": data["cardholder_name"].upper(),
            "last_four": str(len(_cards) + 1001)[-4:],
            "expiry_month": 12,
            "expiry_year": _now().year + 3,
            "created_at": now,
            "updated_at": now,
        }
        _cards[card_id] = record
        return dict(record)


def get_card(card_id: str) -> Optional[dict]:
    with _lock:
        card = _cards.get(card_id)
        return dict(card) if card else None


def update_card_status(card_id: str, status: CardStatus) -> Optional[dict]:
    with _lock:
        card = _cards.get(card_id)
        if not card:
            return None
        card["status"] = status
        card["updated_at"] = _now()
        return dict(card)


def delete_card(card_id: str) -> bool:
    with _lock:
        if card_id not in _cards:
            return False
        _cards[card_id]["status"] = CardStatus.CANCELLED
        _cards[card_id]["updated_at"] = _now()
        return True


# ---------------------------------------------------------------------------
# Merchant operations
# ---------------------------------------------------------------------------


def get_merchant(merchant_id: str) -> Optional[dict]:
    with _lock:
        m = _merchants.get(merchant_id)
        return dict(m) if m else None


def list_merchants(page: int = 1, page_size: int = 20) -> tuple[List[dict], int]:
    with _lock:
        items = [dict(m) for m in _merchants.values()]
        total = len(items)
        start = (page - 1) * page_size
        return items[start : start + page_size], total


# ---------------------------------------------------------------------------
# Admin / system operations
# ---------------------------------------------------------------------------


def get_system_stats() -> dict:
    with _lock:
        all_accounts = list(_accounts.values())
        all_cards = list(_cards.values())
        today_txns = [
            t
            for t in _transactions.values()
            if t["created_at"].date() == _now().date()
        ]
        return {
            "total_accounts": len(all_accounts),
            "active_accounts": sum(1 for a in all_accounts if a["status"] == AccountStatus.ACTIVE),
            "suspended_accounts": sum(
                1 for a in all_accounts if a["status"] == AccountStatus.SUSPENDED
            ),
            "closed_accounts": sum(
                1 for a in all_accounts if a["status"] == AccountStatus.CLOSED
            ),
            "total_transactions_today": len(today_txns),
            "total_volume_today": sum(t["amount"] for t in today_txns) or Decimal("0.00"),
            "total_cards": len(all_cards),
            "active_cards": sum(1 for c in all_cards if c["status"] == CardStatus.ACTIVE),
            "uptime_seconds": time.monotonic() - _APP_START,
            "timestamp": _now(),
        }


def uptime_seconds() -> float:
    return time.monotonic() - _APP_START


# ---------------------------------------------------------------------------
# Refresh token helpers
# ---------------------------------------------------------------------------


def store_refresh_token(token: str, user_id: str) -> None:
    with _lock:
        _refresh_tokens[token] = user_id


def validate_refresh_token(token: str) -> Optional[str]:
    with _lock:
        return _refresh_tokens.get(token)


def revoke_refresh_token(token: str) -> None:
    with _lock:
        _refresh_tokens.pop(token, None)


# ---------------------------------------------------------------------------
# Reset (for tests)
# ---------------------------------------------------------------------------


def reset_database() -> None:
    """Clear all data and re-seed. Used in tests."""
    with _lock:
        _users.clear()
        _accounts.clear()
        _transactions.clear()
        _transfers.clear()
        _limits.clear()
        _cards.clear()
        _merchants.clear()
        _refresh_tokens.clear()
    seed_data()
