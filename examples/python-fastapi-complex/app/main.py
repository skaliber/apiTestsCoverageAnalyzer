"""
Financial Accounts & Transactions API — FastAPI application entry point.

Registers all routers and applies global middleware.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import database as db
from app.constants import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    AUTH_REFRESH_URL,
    AUTH_TOKEN_URL,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.routers import accounts, admin, cards, limits, merchants, statements, transactions, transfers


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Seed the in-memory database on startup."""
    db.seed_data()
    yield


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    application = FastAPI(
        title="Financial Accounts & Transactions API",
        description=(
            "A complete REST API for managing financial accounts, transactions, "
            "transfers, cards, and more. Built with FastAPI."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # -----------------------------------------------------------------------
    # CORS
    # -----------------------------------------------------------------------
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -----------------------------------------------------------------------
    # Auth router (inline — no separate file dependency needed at module level)
    # -----------------------------------------------------------------------
    from fastapi import APIRouter
    from fastapi.security import OAuth2PasswordRequestForm
    from fastapi import Depends
    from app.auth import authenticate_user, create_access_token, create_refresh_token, decode_token
    from app.models import RefreshRequest, TokenResponse

    auth_router = APIRouter(prefix="", tags=["auth"])

    @auth_router.post(AUTH_TOKEN_URL, response_model=TokenResponse)
    def login(form_data: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
        """Authenticate and return an access + refresh token pair."""
        user = authenticate_user(form_data.username, form_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token = create_access_token(
            user_id=user["id"],
            username=user["username"],
            scopes=user.get("scopes", []),
        )
        refresh_token = create_refresh_token(
            user_id=user["id"],
            username=user["username"],
        )
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    @auth_router.post(AUTH_REFRESH_URL, response_model=TokenResponse)
    def refresh(payload: RefreshRequest) -> TokenResponse:
        """Exchange a refresh token for a new access token."""
        user_id = db.validate_refresh_token(payload.refresh_token)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )
        user = db.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )
        db.revoke_refresh_token(payload.refresh_token)
        access_token = create_access_token(
            user_id=user["id"],
            username=user["username"],
            scopes=user.get("scopes", []),
        )
        new_refresh_token = create_refresh_token(
            user_id=user["id"],
            username=user["username"],
        )
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    # -----------------------------------------------------------------------
    # Register routers
    # -----------------------------------------------------------------------
    application.include_router(auth_router)
    application.include_router(accounts.router)
    application.include_router(transactions.router)
    application.include_router(transfers.router)
    application.include_router(limits.router)
    application.include_router(statements.router)
    application.include_router(cards.router)
    application.include_router(merchants.router)
    application.include_router(admin.router)

    # -----------------------------------------------------------------------
    # Exception handlers
    # -----------------------------------------------------------------------

    @application.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
        )

    return application


app = create_app()
