"""Limits router — read and update per-account spending limits."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import LIMITS_BY_ACCOUNT
from app.models import AccountLimits, ErrorResponse, Limit, LimitUpdate

router = APIRouter(prefix="", tags=["limits"])


def _assert_ownership(account: dict, user: dict) -> None:
    if account["owner_id"] != user["id"] and "admin" not in user.get("scopes", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this account",
        )


@router.get(
    LIMITS_BY_ACCOUNT,
    response_model=AccountLimits,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_limits(
    account_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> AccountLimits:
    """Retrieve all spending limits for an account."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)

    limits = db.get_limits(account_id)
    if limits is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Limits not found")

    from datetime import datetime, timezone

    return AccountLimits(
        account_id=account_id,
        limits=[
            Limit(
                limit_type=lim["limit_type"],
                amount=lim["amount"],
                used_today=lim["used_today"],
                remaining=lim["amount"] - lim["used_today"],
                reset_at=lim["reset_at"],
            )
            for lim in limits
        ],
        updated_at=datetime.now(timezone.utc),
    )


@router.put(
    LIMITS_BY_ACCOUNT,
    response_model=AccountLimits,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_limits(
    account_id: str,
    payload: LimitUpdate,
    current_user: dict = Depends(get_current_active_user),
) -> AccountLimits:
    """Update a specific spending limit for an account."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)

    updated_limits = db.update_limit(account_id, payload.limit_type, payload.amount)
    if updated_limits is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Limits not found")

    from datetime import datetime, timezone

    return AccountLimits(
        account_id=account_id,
        limits=[
            Limit(
                limit_type=lim["limit_type"],
                amount=lim["amount"],
                used_today=lim["used_today"],
                remaining=lim["amount"] - lim["used_today"],
                reset_at=lim["reset_at"],
            )
            for lim in updated_limits
        ],
        updated_at=datetime.now(timezone.utc),
    )
