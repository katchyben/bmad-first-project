"""Request-scoped FastAPI dependencies."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer

from bmad_first_project.application.auth import authenticate
from bmad_first_project.application.ports import Clock, PasswordHasher, UnitOfWork
from bmad_first_project.domain.session import UserSession

TOKEN_URL = "/api/auth/token"


def get_clock(request: Request) -> Clock:
    """Return the clock wired into the app by the composition root."""
    return request.app.state.clock


def get_engine(request: Request) -> Any:
    """Return the database engine wired into the app by the composition root.

    Typed `Any` because SQLAlchemy may only be imported under
    `adapters/persistence`; the value is that adapter's `Engine`.
    """
    return request.app.state.engine


def get_password_hasher(request: Request) -> PasswordHasher:
    """Return the password hasher wired into the app by the composition root."""
    return request.app.state.password_hasher


PasswordHasherDep = Annotated[PasswordHasher, Depends(get_password_hasher)]


def get_now(clock: Annotated[Clock, Depends(get_clock)]) -> datetime:
    """Read the clock once per request and require an aware UTC value.

    FastAPI caches dependency results per request, so every dependant of
    `get_now` within one request shares this single reading.
    """
    now = clock.now()
    if now.tzinfo is None or now.utcoffset() != timedelta(0):
        raise RuntimeError(f"Clock must return an aware UTC datetime, got {now!r}")
    return now.astimezone(UTC)


def _get_unit_of_work(request: Request) -> Iterator[UnitOfWork]:
    """Open one unit of work for the request.

    Commits when the route returns and rolls back (re-raising) when it raises.
    Use it only through `UnitOfWorkDep`: its function scope makes the exit, and
    so the commit, run before the response is sent.
    """
    factory: Callable[[], UnitOfWork] = request.app.state.unit_of_work_factory
    with factory() as uow:
        yield uow


UnitOfWorkDep = Annotated[UnitOfWork, Depends(_get_unit_of_work, scope="function")]


NowDep = Annotated[datetime, Depends(get_now)]

# `auto_error=False`: a missing or non-Bearer header yields None, so the
# rejection comes from `authenticate` as the envelope, never `{"detail": ...}`.
_bearer_token = OAuth2PasswordBearer(tokenUrl=TOKEN_URL, auto_error=False)


def _get_current_session(
    uow: UnitOfWorkDep,
    now: NowDep,
    token: Annotated[str | None, Depends(_bearer_token)],
) -> UserSession:
    """Authenticate the request's bearer token within the request's unit of work."""
    return authenticate(uow, now, token)


# The one auth dependency every protected route uses. It shares the request's
# unit of work and `now`, and raises `UnauthenticatedError` (a 401 envelope with
# `WWW-Authenticate: Bearer`) before any body validation runs.
CurrentSessionDep = Annotated[UserSession, Depends(_get_current_session)]
