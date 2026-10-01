"""Request-scoped FastAPI dependencies."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request

from bmad_first_project.application.ports import Clock


def get_clock(request: Request) -> Clock:
    """Return the clock wired into the app by the composition root."""
    return request.app.state.clock


def get_now(clock: Annotated[Clock, Depends(get_clock)]) -> datetime:
    """Read the clock once per request and require an aware UTC value.

    FastAPI caches dependency results per request, so every dependant of
    `get_now` within one request shares this single reading.
    """
    now = clock.now()
    if now.tzinfo is None or now.utcoffset() != timedelta(0):
        raise RuntimeError(f"Clock must return an aware UTC datetime, got {now!r}")
    return now.astimezone(UTC)
