"""
JWT authentication utilities for the Financial Accounts API.
Provides token creation, verification, and FastAPI dependency injection helpers.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app import database as db
from app.constants import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
)
from app.models import TokenData

# ---------------------------------------------------------------------------
# Crypto helpers
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------


def create_access_token(
    user_id: str,
    username: str,
    scopes: List[str],
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": user_id,
        "username": username,
        "scopes": scopes,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "username": username,
        "exp": expire,
        "type": "refresh",
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    db.store_refresh_token(token, user_id)
    return token


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise credentials_exc
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exc
    user = db.get_user_by_id(user_id)
    if user is None:
        raise credentials_exc
    if not user.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    return user


def get_current_active_user(current_user: dict = Depends(get_current_user)) -> dict:
    return current_user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if "admin" not in current_user.get("scopes", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


# ---------------------------------------------------------------------------
# Authenticate helper (used by /auth/token)
# ---------------------------------------------------------------------------


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = db.get_user_by_username(username)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user
