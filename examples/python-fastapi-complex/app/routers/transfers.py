"""Transfers router — fund transfers between accounts."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import (
    TRANSFER_BY_ID,
    TRANSFERS_BASE,
    AccountStatus,
    MINIMUM_TRANSFER_AMOUNT,
)
from app.models import ErrorResponse, Transfer, TransferCreate

router = APIRouter(prefix="", tags=["transfers"])


@router.post(
    TRANSFERS_BASE,
    response_model=Transfer,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def create_transfer(
    payload: TransferCreate,
    current_user: dict = Depends(get_current_active_user),
) -> Transfer:
    """Transfer funds between two accounts."""
    src = db.get_account(payload.source_account_id)
    if not src:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source account not found",
        )

    dst = db.get_account(payload.destination_account_id)
    if not dst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination account not found",
        )

    # Business Rule: account-ownership
    if src["owner_id"] != current_user["id"] and "admin" not in current_user.get("scopes", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to source account")

    # Business Rule: minimum-transfer-amount
    if payload.amount < Decimal(str(MINIMUM_TRANSFER_AMOUNT)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum transfer amount is ${MINIMUM_TRANSFER_AMOUNT:.2f}",
        )

    # Business Rule: suspended-account-no-transactions
    if src["status"] == AccountStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source account is suspended",
        )
    if src["status"] == AccountStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source account is closed",
        )

    # Business Rule: transfer-sufficient-funds
    if src["available_balance"] < payload.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient funds for this transfer",
        )

    # Business Rule: daily-transfer-limit
    limits = db.get_limits(payload.source_account_id)
    if limits:
        from app.constants import LimitType

        for lim in limits:
            if lim["limit_type"] == LimitType.DAILY_TRANSFER:
                if lim["used_today"] + payload.amount > lim["amount"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Daily transfer limit would be exceeded",
                    )
                break

    record = db.create_transfer(payload.model_dump())
    return Transfer(**record)


@router.get(
    TRANSFER_BY_ID,
    response_model=Transfer,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_transfer(
    transfer_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> Transfer:
    """Retrieve a transfer by ID."""
    transfer = db.get_transfer(transfer_id)
    if not transfer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    # Check ownership of source account
    src = db.get_account(transfer["source_account_id"])
    if src and src["owner_id"] != current_user["id"] and "admin" not in current_user.get("scopes", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return Transfer(**transfer)
