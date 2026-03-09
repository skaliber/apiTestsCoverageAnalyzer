"""Cards router — card lifecycle management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import CARD_BY_ID, CARD_STATUS, CARDS_BASE, CardStatus
from app.models import Card, CardCreate, CardStatusUpdate, ErrorResponse

router = APIRouter(prefix="", tags=["cards"])


def _assert_card_ownership(card: dict, user: dict) -> None:
    account = db.get_account(card["account_id"])
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated account not found")
    if account["owner_id"] != user["id"] and "admin" not in user.get("scopes", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this card",
        )


@router.post(
    CARDS_BASE,
    response_model=Card,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def issue_card(
    payload: CardCreate,
    current_user: dict = Depends(get_current_active_user),
) -> Card:
    """Issue a new card linked to an account."""
    account = db.get_account(payload.account_id)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if account["owner_id"] != current_user["id"] and "admin" not in current_user.get("scopes", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    from app.constants import AccountStatus

    if account["status"] == AccountStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot issue a card for a closed account",
        )

    record = db.create_card(payload.model_dump())
    return Card(**record)


@router.get(
    CARD_BY_ID,
    response_model=Card,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_card(
    card_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> Card:
    """Retrieve a card by ID."""
    card = db.get_card(card_id)
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    _assert_card_ownership(card, current_user)
    return Card(**card)


@router.put(
    CARD_STATUS,
    response_model=Card,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def update_card_status(
    card_id: str,
    payload: CardStatusUpdate,
    current_user: dict = Depends(get_current_active_user),
) -> Card:
    """Activate, suspend, or cancel a card."""
    card = db.get_card(card_id)
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    _assert_card_ownership(card, current_user)

    # Cannot reactivate a cancelled card
    if card["status"] == CardStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A cancelled card cannot be modified",
        )

    updated = db.update_card_status(card_id, payload.status)
    return Card(**updated)


@router.delete(
    CARD_BY_ID,
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def cancel_card(
    card_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> None:
    """Cancel (permanently deactivate) a card."""
    card = db.get_card(card_id)
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    _assert_card_ownership(card, current_user)
    db.delete_card(card_id)
