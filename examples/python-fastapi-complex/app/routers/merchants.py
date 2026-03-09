"""Merchants router — merchant directory lookup."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import database as db
from app.auth import get_current_active_user
from app.constants import MERCHANT_BY_ID, MERCHANTS_BASE
from app.models import ErrorResponse, Merchant, MerchantList

router = APIRouter(prefix="", tags=["merchants"])


@router.get(
    MERCHANTS_BASE,
    response_model=MerchantList,
    responses={401: {"model": ErrorResponse}},
)
def list_merchants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user),
) -> MerchantList:
    """List all merchants in the directory."""
    items, total = db.list_merchants(page=page, page_size=page_size)
    return MerchantList(
        items=[Merchant(**m) for m in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    MERCHANT_BY_ID,
    response_model=Merchant,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_merchant(
    merchant_id: str,
    current_user: dict = Depends(get_current_active_user),
) -> Merchant:
    """Retrieve a single merchant by ID."""
    merchant = db.get_merchant(merchant_id)
    if not merchant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    return Merchant(**merchant)
