"""`login`, `authenticate` and `logout` against in-memory ports."""

import hashlib
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

import pytest

from bmad_first_project.application.auth import authenticate, login, logout
from bmad_first_project.domain.account import Account
from bmad_first_project.domain.errors import UnauthenticatedError
from bmad_first_project.domain.session import UserSession

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
BAD_CREDENTIALS = "That username and password don't match."
LOG_IN = "Log in to continue."


class FakeHasher:
    def __init__(self) -> None:
        self.hashed: list[str] = []

    def hash(self, password: str) -> str:
        self.hashed.append(password)
        return f"hashed:{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        return password_hash == f"hashed:{password}"


class MemoryAccounts:
    def __init__(self, account: Account | None) -> None:
        self.account = account

    def get(self) -> Account | None:
        return self.account

    def add(self, account: Account) -> None:
        raise AssertionError("login must not write accounts")

    def save(self, account: Account) -> None:
        raise AssertionError("login must not write accounts")


class MemorySessions:
    def __init__(self) -> None:
        self.rows: list[UserSession] = []

    def add(self, session: UserSession) -> None:
        self.rows.append(session)

    def get(self, token_hash: str) -> UserSession | None:
        return next((s for s in self.rows if s.token_hash == token_hash), None)

    def delete(self, token_hash: str) -> None:
        self.rows = [s for s in self.rows if s.token_hash != token_hash]

    def delete_all(self) -> None:
        self.rows = []


class FakeUnitOfWork:
    def __init__(self, account: Account | None) -> None:
        self._accounts = MemoryAccounts(account)
        self._sessions = MemorySessions()

    @property
    def accounts(self) -> MemoryAccounts:
        return self._accounts

    @property
    def sessions(self) -> MemorySessions:
        return self._sessions

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        pass


@pytest.fixture
def uow() -> FakeUnitOfWork:
    return FakeUnitOfWork(
        Account(id=7, username="benny", password_hash="hashed:s3cret")
    )


def test_login_stores_only_the_hash_with_a_seven_day_expiry(
    uow: FakeUnitOfWork,
) -> None:
    token = login(uow, FakeHasher(), NOW, "benny", "s3cret")

    assert len(token) >= 43
    assert uow.sessions.rows == [
        UserSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            account_id=7,
            expires_at=NOW + timedelta(days=7),
        )
    ]


def test_each_login_gets_a_new_token(uow: FakeUnitOfWork) -> None:
    first = login(uow, FakeHasher(), NOW, "benny", "s3cret")
    second = login(uow, FakeHasher(), NOW, "benny", "s3cret")

    assert first != second
    assert len(uow.sessions.rows) == 2


def test_username_is_trimmed_then_compared_exactly(uow: FakeUnitOfWork) -> None:
    login(uow, FakeHasher(), NOW, "  benny  ", "s3cret")

    with pytest.raises(UnauthenticatedError):
        login(uow, FakeHasher(), NOW, "Benny", "s3cret")


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("benny", "nope"),
        ("alice", "s3cret"),
        ("   ", "s3cret"),
        ("benny", " s3cret"),
    ],
)
def test_bad_credentials_are_refused_identically(
    uow: FakeUnitOfWork, username: str, password: str
) -> None:
    with pytest.raises(UnauthenticatedError) as caught:
        login(uow, FakeHasher(), NOW, username, password)

    assert caught.value.message == BAD_CREDENTIALS
    assert uow.sessions.rows == []


def test_unknown_username_still_spends_a_hash(uow: FakeUnitOfWork) -> None:
    hasher = FakeHasher()

    with pytest.raises(UnauthenticatedError):
        login(uow, hasher, NOW, "alice", "s3cret")

    assert hasher.hashed == ["s3cret"]


def test_no_account_is_refused() -> None:
    uow = FakeUnitOfWork(None)

    with pytest.raises(UnauthenticatedError, match=BAD_CREDENTIALS):
        login(uow, FakeHasher(), NOW, "benny", "s3cret")


def test_authenticate_accepts_until_expiry(uow: FakeUnitOfWork) -> None:
    token = login(uow, FakeHasher(), NOW, "benny", "s3cret")
    last_moment = NOW + timedelta(days=7) - timedelta(microseconds=1)

    assert authenticate(uow, last_moment, token) == uow.sessions.rows[0]

    for when in (NOW + timedelta(days=7), NOW + timedelta(days=30)):
        with pytest.raises(UnauthenticatedError, match=LOG_IN):
            authenticate(uow, when, token)


@pytest.mark.parametrize("token", [None, "", "unknown"])
def test_authenticate_rejects_missing_or_unknown(
    uow: FakeUnitOfWork, token: str | None
) -> None:
    login(uow, FakeHasher(), NOW, "benny", "s3cret")

    with pytest.raises(UnauthenticatedError, match=LOG_IN):
        authenticate(uow, NOW, token)


def test_logout_deletes_only_that_session(uow: FakeUnitOfWork) -> None:
    kept = login(uow, FakeHasher(), NOW, "benny", "s3cret")
    ended = login(uow, FakeHasher(), NOW, "benny", "s3cret")

    logout(uow, authenticate(uow, NOW, ended))

    with pytest.raises(UnauthenticatedError):
        authenticate(uow, NOW, ended)
    assert authenticate(uow, NOW, kept)
