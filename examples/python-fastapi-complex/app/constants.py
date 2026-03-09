"""
URL constants and enums for the Financial Accounts API.
Centralizes all endpoint paths to ensure consistency across the application and tests.
"""

from enum import Enum

# ---------------------------------------------------------------------------
# Base paths
# ---------------------------------------------------------------------------

API_V1_PREFIX = "/api/v1"

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

AUTH_BASE = "/auth"
AUTH_TOKEN_URL = "/auth/token"
AUTH_REFRESH_URL = "/auth/refresh"

# ---------------------------------------------------------------------------
# Account endpoints
# ---------------------------------------------------------------------------

ACCOUNTS_BASE = "/accounts"
ACCOUNT_BY_ID = "/accounts/{account_id}"
ACCOUNT_BALANCE = "/accounts/{account_id}/balance"
ACCOUNT_SUMMARY = "/accounts/{account_id}/summary"

# ---------------------------------------------------------------------------
# Transaction endpoints
# ---------------------------------------------------------------------------

TRANSACTIONS_BASE = "/transactions"
TRANSACTION_BY_ID = "/transactions/{transaction_id}"

# ---------------------------------------------------------------------------
# Transfer endpoints
# ---------------------------------------------------------------------------

TRANSFERS_BASE = "/transfers"
TRANSFER_BY_ID = "/transfers/{transfer_id}"

# ---------------------------------------------------------------------------
# Limits endpoints
# ---------------------------------------------------------------------------

LIMITS_BY_ACCOUNT = "/limits/{account_id}"

# ---------------------------------------------------------------------------
# Statement endpoints
# ---------------------------------------------------------------------------

STATEMENTS_BY_ACCOUNT = "/statements/{account_id}"
STATEMENT_BY_MONTH = "/statements/{account_id}/{month}"

# ---------------------------------------------------------------------------
# Card endpoints
# ---------------------------------------------------------------------------

CARDS_BASE = "/cards"
CARD_BY_ID = "/cards/{card_id}"
CARD_STATUS = "/cards/{card_id}/status"

# ---------------------------------------------------------------------------
# Merchant endpoints
# ---------------------------------------------------------------------------

MERCHANTS_BASE = "/merchants"
MERCHANT_BY_ID = "/merchants/{merchant_id}"

# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

ADMIN_HEALTH = "/admin/health"
ADMIN_STATS = "/admin/stats"


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AccountStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"
    PENDING = "pending"


class AccountType(str, Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    INVESTMENT = "investment"


class TransactionType(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"
    TRANSFER = "transfer"
    FEE = "fee"
    INTEREST = "interest"


class TransactionStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"


class CardStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class CardType(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"
    PREPAID = "prepaid"


class TransferStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REVERSED = "reversed"


class StatementStatus(str, Enum):
    AVAILABLE = "available"
    PROCESSING = "processing"


class LimitType(str, Enum):
    DAILY_TRANSFER = "daily_transfer"
    SINGLE_TRANSACTION = "single_transaction"
    MONTHLY_SPENDING = "monthly_spending"
    ATM_WITHDRAWAL = "atm_withdrawal"


# ---------------------------------------------------------------------------
# Business rule constants
# ---------------------------------------------------------------------------

MINIMUM_TRANSFER_AMOUNT = 1.00
DEFAULT_DAILY_TRANSFER_LIMIT = 10_000.00
DEFAULT_SINGLE_TRANSACTION_LIMIT = 5_000.00
DEFAULT_MONTHLY_SPENDING_LIMIT = 50_000.00
DEFAULT_ATM_WITHDRAWAL_LIMIT = 1_000.00

# JWT / Auth
SECRET_KEY = "financial-api-super-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
