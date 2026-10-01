"""`create_or_update_account` against in-memory ports."""

from dataclasses import replace
from datetime import UTC, datetime
from types import TracebackType
from typing import Self

import pytest

from bmad_first_project.application.accounts import (
    AccountChange,
    AccountResult,
    create_or_update_account,
)
from bmad_first_project.domain.account import Account
from bmad_first_project.domain.errors import DomainValidationError, StateConflictError

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


class FakeHasher:
    def hash(self, password: str) -> str:
        return f"hashed:{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        return password_hash == f"hashed:{password}"


class MemoryAccounts:
    def __init__(self) -> None:
        self.rows: list[Account] = []
        self.writes = 0

    def get(self) -> Account | None:
        return self.rows[0] if self.rows else None

    def add(self, account: Account) -> None:
        self.writes += 1
        self.rows.append(replace(account, id=len(self.rows) + 1))

    def save(self, account: Account) -> None:
        self.writes += 1
        self.rows = [account if row.id == account.id else row for row in self.rows]


class FakeUnitOfWork:
    def __init__(self) -> None:
        self._accounts = MemoryAccounts()

    @property
    def accounts(self) -> MemoryAccounts:
        return self._accounts

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
    return FakeUnitOfWork()


hasher = FakeHasher()


def _run(uow: FakeUnitOfWork, username: str, password: str) -> AccountResult:
    return create_or_update_account(uow, hasher, NOW, username, password)


def test_first_run_creates_the_account_with_a_hash(uow: FakeUnitOfWork) -> None:
    assert _run(uow, "benny", "s3cret") == AccountResult(AccountChange.CREATED, "benny")

    assert uow.accounts.rows == [
        Account(id=1, username="benny", password_hash="hashed:s3cret")
    ]


def test_padded_username_is_stored_trimmed(uow: FakeUnitOfWork) -> None:
    assert _run(uow, "  benny  ", "s3cret").username == "benny"
    assert uow.accounts.rows[0].username == "benny"


def test_rerun_updates_the_password_without_a_second_row(uow: FakeUnitOfWork) -> None:
    _run(uow, "benny", "s3cret")

    assert _run(uow, " benny ", "n3w") == AccountResult(AccountChange.UPDATED, "benny")

    assert uow.accounts.rows == [
        Account(id=1, username="benny", password_hash="hashed:n3w")
    ]


def test_different_username_is_refused_without_writing(uow: FakeUnitOfWork) -> None:
    _run(uow, "benny", "s3cret")

    with pytest.raises(StateConflictError) as caught:
        _run(uow, "alice", "n3w")

    assert caught.value.message == "An account already exists for 'benny'."
    assert uow.accounts.writes == 1
    assert uow.accounts.rows[0].password_hash == "hashed:s3cret"


@pytest.mark.parametrize(
    ("username", "password", "message"),
    [("   ", "s3cret", "Enter a username."), ("benny", "", "Enter a password.")],
)
def test_invalid_input_is_rejected_without_writing(
    uow: FakeUnitOfWork, username: str, password: str, message: str
) -> None:
    with pytest.raises(DomainValidationError, match=message):
        _run(uow, username, password)

    assert uow.accounts.writes == 0
