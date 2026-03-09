"""
Pydantic models for the Financial Accounts API.
Defines request/response schemas for all resources.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

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
)


# ---------------------------------------------------------------------------
# Auth models
# ---------------------------------------------------------------------------


class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None
    scopes: List[str] = []


# ---------------------------------------------------------------------------
# User models (internal)
# ---------------------------------------------------------------------------


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    password: str


class User(UserBase):
    id: str
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Account models
# ---------------------------------------------------------------------------


class AccountCreate(BaseModel):
    account_type: AccountType
    currency: str = Field(default="USD", min_length=3, max_length=3)
    initial_deposit: Decimal = Field(default=Decimal("0.00"), ge=0)
    nickname: Optional[str] = Field(None, max_length=100)

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: str) -> str:
        return v.upper()


class AccountUpdate(BaseModel):
    nickname: Optional[str] = Field(None, max_length=100)
    status: Optional[AccountStatus] = None


class AccountBalance(BaseModel):
    account_id: str
    available_balance: Decimal
    current_balance: Decimal
    pending_amount: Decimal
    currency: str
    as_of: datetime


class AccountSummary(BaseModel):
    account_id: str
    account_type: AccountType
    status: AccountStatus
    currency: str
    available_balance: Decimal
    current_balance: Decimal
    total_transactions: int
    last_transaction_at: Optional[datetime]
    monthly_spending: Decimal
    monthly_income: Decimal


class Account(BaseModel):
    id: str
    owner_id: str
    account_number: str
    account_type: AccountType
    status: AccountStatus
    currency: str
    available_balance: Decimal
    current_balance: Decimal
    nickname: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AccountList(BaseModel):
    items: List[Account]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Transaction models
# ---------------------------------------------------------------------------


class TransactionCreate(BaseModel):
    account_id: str
    amount: Decimal = Field(..., gt=0)
    transaction_type: TransactionType
    description: str = Field(..., min_length=1, max_length=500)
    idempotency_key: Optional[str] = Field(None, max_length=64)
    merchant_id: Optional[str] = None
    metadata: Optional[dict] = None

    @field_validator("amount")
    @classmethod
    def round_amount(cls, v: Decimal) -> Decimal:
        return v.quantize(Decimal("0.01"))


class Transaction(BaseModel):
    id: str
    account_id: str
    amount: Decimal
    transaction_type: TransactionType
    status: TransactionStatus
    description: str
    idempotency_key: Optional[str]
    merchant_id: Optional[str]
    metadata: Optional[dict]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TransactionList(BaseModel):
    items: List[Transaction]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Transfer models
# ---------------------------------------------------------------------------


class TransferCreate(BaseModel):
    source_account_id: str
    destination_account_id: str
    amount: Decimal = Field(..., gt=0)
    description: str = Field(..., min_length=1, max_length=500)
    idempotency_key: Optional[str] = Field(None, max_length=64)

    @field_validator("amount")
    @classmethod
    def round_amount(cls, v: Decimal) -> Decimal:
        return v.quantize(Decimal("0.01"))


class Transfer(BaseModel):
    id: str
    source_account_id: str
    destination_account_id: str
    amount: Decimal
    description: str
    status: TransferStatus
    idempotency_key: Optional[str]
    fee: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Limit models
# ---------------------------------------------------------------------------


class LimitUpdate(BaseModel):
    limit_type: LimitType
    amount: Decimal = Field(..., gt=0)


class Limit(BaseModel):
    limit_type: LimitType
    amount: Decimal
    used_today: Decimal
    remaining: Decimal
    reset_at: datetime


class AccountLimits(BaseModel):
    account_id: str
    limits: List[Limit]
    updated_at: datetime


# ---------------------------------------------------------------------------
# Statement models
# ---------------------------------------------------------------------------


class StatementEntry(BaseModel):
    date: str  # YYYY-MM-DD
    description: str
    amount: Decimal
    balance: Decimal
    transaction_type: TransactionType


class Statement(BaseModel):
    account_id: str
    month: str  # YYYY-MM
    status: StatementStatus
    opening_balance: Decimal
    closing_balance: Decimal
    total_credits: Decimal
    total_debits: Decimal
    entries: List[StatementEntry]
    generated_at: datetime


class StatementSummary(BaseModel):
    month: str
    status: StatementStatus
    closing_balance: Decimal
    total_transactions: int


class StatementList(BaseModel):
    account_id: str
    statements: List[StatementSummary]


# ---------------------------------------------------------------------------
# Card models
# ---------------------------------------------------------------------------


class CardCreate(BaseModel):
    account_id: str
    card_type: CardType
    cardholder_name: str = Field(..., min_length=2, max_length=100)


class CardStatusUpdate(BaseModel):
    status: CardStatus
    reason: Optional[str] = Field(None, max_length=300)


class Card(BaseModel):
    id: str
    account_id: str
    card_type: CardType
    status: CardStatus
    cardholder_name: str
    last_four: str
    expiry_month: int
    expiry_year: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Merchant models
# ---------------------------------------------------------------------------


class Merchant(BaseModel):
    id: str
    name: str
    category: str
    mcc_code: str
    country: str
    is_active: bool

    model_config = {"from_attributes": True}


class MerchantList(BaseModel):
    items: List[Merchant]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Admin models
# ---------------------------------------------------------------------------


class HealthCheck(BaseModel):
    status: str
    version: str
    environment: str
    uptime_seconds: float
    database: str
    timestamp: datetime


class SystemStats(BaseModel):
    total_accounts: int
    active_accounts: int
    suspended_accounts: int
    closed_accounts: int
    total_transactions_today: int
    total_volume_today: Decimal
    total_cards: int
    active_cards: int
    uptime_seconds: float
    timestamp: datetime


# ---------------------------------------------------------------------------
# Error models
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str
    details: Optional[List[ErrorDetail]] = None
    request_id: Optional[str] = None
