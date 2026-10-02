"""A login session: how long it lasts and when it stops being valid."""

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta

SESSION_LIFETIME = timedelta(days=7)


@dataclass(frozen=True)
class UserSession:
    """One login. Only the token's hash is kept, never the token itself."""

    token_hash: str
    account_id: int
    expires_at: datetime
    id: int | None = None


def hash_token(token: str) -> str:
    """The SHA-256 hex digest stored in place of the token."""
    return hashlib.sha256(token.encode()).hexdigest()


def session_expiry(now: datetime) -> datetime:
    """A session started at `now` expires exactly `SESSION_LIFETIME` later."""
    return now + SESSION_LIFETIME


def is_session_valid(session: UserSession, now: datetime) -> bool:
    """Valid only while `now` is strictly before `expires_at`; use never extends it."""
    return now < session.expires_at
