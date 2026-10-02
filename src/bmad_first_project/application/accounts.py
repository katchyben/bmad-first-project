"""Use cases for the app's single account."""

from dataclasses import dataclass, replace
from datetime import datetime
from enum import Enum

from bmad_first_project.application.ports import PasswordHasher, UnitOfWork
from bmad_first_project.domain.account import (
    Account,
    check_password,
    normalise_username,
)
from bmad_first_project.domain.errors import StateConflictError


class AccountChange(Enum):
    CREATED = "created"
    UPDATED = "updated"


@dataclass(frozen=True)
class AccountResult:
    """What the use case did, and the username as stored."""

    change: AccountChange
    username: str


def create_or_update_account(
    uow: UnitOfWork,
    hasher: PasswordHasher,
    now: datetime,
    username: str,
    password: str,
) -> AccountResult:
    """Create the one account, or set a new password on it, and end every session.

    `uow` must be active. If an account exists under another username, nothing
    is written and `StateConflictError` is raised. `now` is unused for now: the
    account has no time columns, but every use case takes the command's `now`.
    """
    del now
    username = normalise_username(username)
    password = check_password(password)

    existing = uow.accounts.get()
    if existing is None:
        uow.accounts.add(
            Account(username=username, password_hash=hasher.hash(password))
        )
        uow.sessions.delete_all()
        return AccountResult(AccountChange.CREATED, username)
    if existing.username != username:
        raise StateConflictError(
            f"An account already exists for '{existing.username}'."
        )
    uow.accounts.save(replace(existing, password_hash=hasher.hash(password)))
    uow.sessions.delete_all()
    return AccountResult(AccountChange.UPDATED, username)
