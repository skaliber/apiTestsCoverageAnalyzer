"""Accounts router — CRUD + balance + summary endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import (
    ACCOUNT_BALANCE,
    ACCOUNT_BY_ID,
    ACCOUNT_SUMMARY,
    ACCOUNTS_BASE,
    AccountStatus,
)
from app.models import (
    Account,
    AccountBalance,
    AccountCreate,
    AccountList,
    AccountSummary,
    AccountUpdate,
    ErrorResponse,
)

router = APIRouter(prefix="", tags=["accounts"])


def _assert_ownership(account: dict, user: dict) -> None:
    """Raise 403 if the current user does not own the account."""
    if account["owner_id"] != user["id"] and "admin" not in user.get("scopes", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this account",
        )


@router.post(
    ACCOUNTS_BASE,
    response_model=Account,
    status_code=status.HTTP_201_CREATED,
    responses={401: {"model": ErrorResponse}},
)
def create_account(
    payload: AccountCreate,
    current_user: dict = Depends(get_current_active_user),
) -> Account:
    """Open a new financial account for the authenticated user."""
    record = db.create_account(current_user["id"], payload.model_dump())
    return Account(**record)


@router.get(
    ACCOUNTS_BASE,
    response_model=AccountList,
    responses={401: {"model": ErrorResponse}},
)
def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user),
) -> AccountList:
    """List all accounts owned by the authenticated user."""
    items, total = db.list_accounts(current_user["id"], page=page, page_size=page_size)
    return AccountList(
        items=[Account(**a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    ACCOUNT_BY_ID,
    response_model=Account,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_account(
    account_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> Account:
    """Retrieve a single account by ID."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)
    return Account(**account)


@router.put(
    ACCOUNT_BY_ID,
    response_model=Account,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_account(
    account_id: str,
    payload: AccountUpdate,
    current_user: dict = Depends(get_current_active_user),
) -> Account:
    """Update account metadata or status."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)
    updated = db.update_account(account_id, payload.model_dump(exclude_none=True))
    return Account(**updated)


@router.delete(
    ACCOUNT_BY_ID,
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def delete_account(
    account_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> None:
    """Close an account. The account must have a zero balance."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)

    # Business Rule: account-closure-zero-balance
    if account["current_balance"] != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account must have a zero balance before closing",
        )
    # Business Rule: cannot close already closed account
    if account["status"] == AccountStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already closed",
        )
    db.delete_account(account_id)


@router.get(
    ACCOUNT_BALANCE,
    response_model=AccountBalance,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_balance(
    account_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> AccountBalance:
    """Get the current balance details for an account."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)
    from datetime import datetime, timezone

    return AccountBalance(
        account_id=account_id,
        available_balance=account["available_balance"],
        current_balance=account["current_balance"],
        pending_amount=account["current_balance"] - account["available_balance"],
        currency=account["currency"],
        as_of=datetime.now(timezone.utc),
    )


@router.get(
    ACCOUNT_SUMMARY,
    response_model=AccountSummary,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_summary(
    account_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> AccountSummary:
    """Get a rich summary of account activity."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)

    from decimal import Decimal
    from app.constants import TransactionType

    txns, total = db.list_transactions(account_id=account_id, page=1, page_size=1000)
    last_txn_at = txns[0]["created_at"] if txns else None
    monthly_income = sum(
        (t["amount"] for t in txns if t["transaction_type"] in (TransactionType.CREDIT, TransactionType.INTEREST)),
        Decimal("0.00"),
    )
    monthly_spending = sum(
        (t["amount"] for t in txns if t["transaction_type"] == TransactionType.DEBIT),
        Decimal("0.00"),
    )

    return AccountSummary(
        account_id=account_id,
        account_type=account["account_type"],
        status=account["status"],
        currency=account["currency"],
        available_balance=account["available_balance"],
        current_balance=account["current_balance"],
        total_transactions=total,
        last_transaction_at=last_txn_at,
        monthly_spending=monthly_spending,
        monthly_income=monthly_income,
    )
