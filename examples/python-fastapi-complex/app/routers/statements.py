"""Statements router — account statement retrieval."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import STATEMENT_BY_MONTH, STATEMENTS_BY_ACCOUNT
from app.models import ErrorResponse, Statement, StatementList, StatementSummary

router = APIRouter(prefix="", tags=["statements"])

_MONTH_PATTERN = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


def _assert_ownership(account: dict, user: dict) -> None:
    if account["owner_id"] != user["id"] and "admin" not in user.get("scopes", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this account",
        )


@router.get(
    STATEMENTS_BY_ACCOUNT,
    response_model=StatementList,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def list_statements(
    account_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> StatementList:
    """List all available statement periods for an account."""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)

    raw = db.get_statements(account_id)
    if raw is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    return StatementList(
        account_id=account_id,
        statements=[
            StatementSummary(
                month=s["month"],
                status=s["status"],
                closing_balance=s["closing_balance"],
                total_transactions=s["total_transactions"],
            )
            for s in raw
        ],
    )


@router.get(
    STATEMENT_BY_MONTH,
    response_model=Statement,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def get_statement(
    account_id: str,
    month: str,
    current_user: dict = Depends(get_current_active_user),
) -> Statement:
    """Retrieve a detailed statement for a specific month (YYYY-MM)."""
    if not _MONTH_PATTERN.match(month):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be in YYYY-MM format",
        )

    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    _assert_ownership(account, current_user)

    stmt = db.get_statement_by_month(account_id, month)
    if stmt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Statement not found")

    from app.models import StatementEntry

    return Statement(
        account_id=stmt["account_id"],
        month=stmt["month"],
        status=stmt["status"],
        opening_balance=stmt["opening_balance"],
        closing_balance=stmt["closing_balance"],
        total_credits=stmt["total_credits"],
        total_debits=stmt["total_debits"],
        entries=[StatementEntry(**e) for e in stmt["entries"]],
        generated_at=stmt["generated_at"],
    )
