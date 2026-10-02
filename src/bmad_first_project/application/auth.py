"""Use cases for logging in, checking a token and logging out."""

import secrets
from datetime import datetime

from bmad_first_project.application.ports import PasswordHasher, UnitOfWork
from bmad_first_project.domain.errors import UnauthenticatedError
from bmad_first_project.domain.session import (
    UserSession,
    hash_token,
    is_session_valid,
    session_expiry,
)

INVALID_CREDENTIALS_MESSAGE = "That username and password don't match."
LOGIN_REQUIRED_MESSAGE = "Log in to continue."


def login(
    uow: UnitOfWork,
    hasher: PasswordHasher,
    now: datetime,
    username: str,
    password: str,
) -> str:
    """Start a session and return its new token.

    The username is trimmed, then compared exactly. An unknown username and a
    wrong password raise the same `UnauthenticatedError`. Only the token's hash
    is stored; the token itself is returned once and never kept.
    """
    account = uow.accounts.get()
    if account is None or account.username != username.strip():
        # Spend the same hashing work as a real check, so timing doesn't tell
        # an unknown username from a wrong password.
        hasher.hash(password)
        raise UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE)
    if not hasher.verify(password, account.password_hash):
        raise UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE)
    if account.id is None:
        raise RuntimeError("A stored account must have an id.")

    token = secrets.token_urlsafe(32)
    uow.sessions.add(
        UserSession(
            token_hash=hash_token(token),
            account_id=account.id,
            expires_at=session_expiry(now),
        )
    )
    return token


def authenticate(uow: UnitOfWork, now: datetime, token: str | None) -> UserSession:
    """Return the live session for `token`, or raise `UnauthenticatedError`.

    A missing, empty, unknown, expired or logged-out token is rejected. A
    session is live only while `now < expires_at`.
    """
    if not token:
        raise UnauthenticatedError(LOGIN_REQUIRED_MESSAGE)
    session = uow.sessions.get(hash_token(token))
    if session is None or not is_session_valid(session, now):
        raise UnauthenticatedError(LOGIN_REQUIRED_MESSAGE)
    return session


def logout(uow: UnitOfWork, session: UserSession) -> None:
    """End `session`; its token is rejected from now on."""
    uow.sessions.delete(session.token_hash)
