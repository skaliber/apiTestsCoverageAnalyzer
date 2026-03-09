"""Transactions router — create and retrieve transactions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import (
    TRANSACTION_BY_ID,
    TRANSACTIONS_BASE,
    AccountStatus,
    TransactionType,
)
from app.models import (
    ErrorResponse,
    Transaction,
    TransactionCreate,
    TransactionList,
)

router = APIRouter(prefix="", tags=["transactions"])


@router.post(
    TRANSACTIONS_BASE,
    response_model=Transaction,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def create_transaction(
    payload: TransactionCreate,
    current_user: dict = Depends(get_current_active_user),
) -> Transaction:
    """Post a new transaction against an account."""
    account = db.get_account(payload.account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Ownership check
    if account["owner_id"] != current_user["id"] and "admin" not in current_user.get("scopes", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Business Rule: suspended-account-no-transactions
    if account["status"] == AccountStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Suspended accounts cannot process transactions",
        )

    if account["status"] == AccountStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed accounts cannot process transactions",
        )

    # Business Rule: card-activation-required (simplified: check debit on inactive account)
    # For debits, ensure balance is sufficient
    if payload.transaction_type == TransactionType.DEBIT:
        if account["available_balance"] < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient funds for this transaction",
            )

    record = db.create_transaction(payload.model_dump())
    return Transaction(**record)


@router.get(
    TRANSACTIONS_BASE,
    response_model=TransactionList,
    responses={401: {"model": ErrorResponse}},
)
def list_transactions(
    account_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user),
) -> TransactionList:
    """List transactions, optionally filtered by account."""
    if account_id:
        account = db.get_account(account_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
        if account["owner_id"] != current_user["id"] and "admin" not in current_user.get("scopes", []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    items, total = db.list_transactions(account_id=account_id, page=page, page_size=page_size)
    return TransactionList(
        items=[Transaction(**t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    TRANSACTION_BY_ID,
    response_model=Transaction,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_transaction(
    transaction_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> Transaction:
    """Retrieve a single transaction by ID."""
    txn = db.get_transaction(transaction_id)
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    account = db.get_account(txn["account_id"])
    if account and account["owner_id"] != current_user["id"] and "admin" not in current_user.get("scopes", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return Transaction(**txn)
