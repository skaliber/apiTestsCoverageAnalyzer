"""Admin router — system health and statistics."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app import database as db
from app.auth import get_current_active_user, require_admin
from app.constants import ADMIN_HEALTH, ADMIN_STATS
from app.models import ErrorResponse, HealthCheck, SystemStats

router = APIRouter(prefix="", tags=["admin"])

_VERSION = "1.0.0"
_ENV = "development"


@router.get(
    ADMIN_HEALTH,
    response_model=HealthCheck,
    responses={401: {"model": ErrorResponse}},
)
def health_check(
    _: dict = Depends(get_current_active_user),
) -> HealthCheck:
    """Return API health status. Requires authentication."""
    return HealthCheck(
        status="ok",
        version=_VERSION,
        environment=_ENV,
        uptime_seconds=db.uptime_seconds(),
        database="in-memory",
        timestamp=datetime.now(timezone.utc),
    )


@router.get(
    ADMIN_STATS,
    response_model=SystemStats,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def system_stats(
    current_user: dict = Depends(require_admin),
) -> SystemStats:
    """Return aggregated system statistics. Requires admin role."""
    stats = db.get_system_stats()
    return SystemStats(**stats)
