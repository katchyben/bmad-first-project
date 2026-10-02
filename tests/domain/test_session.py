"""Session lifetime and validity rules."""

import hashlib
from datetime import UTC, datetime, timedelta

from bmad_first_project.domain.session import (
    SESSION_LIFETIME,
    UserSession,
    hash_token,
    is_session_valid,
    session_expiry,
)

NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)


def test_lifetime_is_seven_days() -> None:
    assert SESSION_LIFETIME == timedelta(days=7)
    assert session_expiry(NOW) == NOW + timedelta(days=7)


def test_valid_strictly_before_expiry() -> None:
    session = UserSession(token_hash="h", account_id=1, expires_at=session_expiry(NOW))
    expires = session.expires_at

    assert is_session_valid(session, NOW)
    assert is_session_valid(session, expires - timedelta(microseconds=1))
    assert not is_session_valid(session, expires)
    assert not is_session_valid(session, expires + timedelta(days=1))


def test_token_hash_is_sha256_hex() -> None:
    assert hash_token("abc") == hashlib.sha256(b"abc").hexdigest()
