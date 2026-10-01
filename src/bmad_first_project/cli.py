"""CLI composition root: console commands that wire adapters to use cases."""

import getpass
import sys
from collections.abc import Callable
from typing import TextIO

from bmad_first_project.adapters.clock import SystemClock
from bmad_first_project.adapters.passwords import Argon2PasswordHasher
from bmad_first_project.adapters.persistence.engine import Engine, make_engine
from bmad_first_project.adapters.persistence.schema import assert_schema_current
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.application.accounts import (
    AccountChange,
    create_or_update_account,
)
from bmad_first_project.application.ports import Clock, PasswordHasher
from bmad_first_project.domain.account import normalise_username
from bmad_first_project.domain.errors import DomainError
from bmad_first_project.settings import Settings

Prompt = Callable[[str], str]

PASSWORD_MISMATCH_MESSAGE = "Those passwords don't match."
CANCELLED_MESSAGE = "Cancelled. Nothing was changed."


def run(
    *,
    prompt: Prompt | None = None,
    prompt_secret: Prompt | None = None,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
    engine: Engine | None = None,
    clock: Clock | None = None,
    hasher: PasswordHasher | None = None,
) -> int:
    """Create the account or change its password; return the exit code.

    Every collaborator can be injected; each one left out is the real thing.
    The password is read with `getpass` (no echo in a terminal) and is never
    printed or logged.
    """
    prompt = prompt if prompt is not None else input
    prompt_secret = prompt_secret if prompt_secret is not None else getpass.getpass
    stdout = stdout if stdout is not None else sys.stdout
    stderr = stderr if stderr is not None else sys.stderr
    clock = clock if clock is not None else SystemClock()
    hasher = hasher if hasher is not None else Argon2PasswordHasher()

    owns_engine = engine is None
    if engine is None:
        engine = make_engine(Settings().database_url)
    try:
        try:
            assert_schema_current(engine)
        except RuntimeError as error:
            print(error, file=stderr)
            return 1

        try:
            username = prompt("Username: ")
            try:
                normalise_username(username)
            except DomainError as error:
                print(error.message, file=stderr)
                return 1
            password = prompt_secret("Password: ")
            repeated = prompt_secret("Repeat password: ")
        except (EOFError, KeyboardInterrupt):
            print(file=stderr)
            print(CANCELLED_MESSAGE, file=stderr)
            return 1
        if password != repeated:
            print(PASSWORD_MISMATCH_MESSAGE, file=stderr)
            return 1

        now = clock.now()
        try:
            with SqlUnitOfWork(engine) as uow:
                result = create_or_update_account(uow, hasher, now, username, password)
        except DomainError as error:
            print(error.message, file=stderr)
            return 1

        if result.change is AccountChange.CREATED:
            print(f"Account '{result.username}' created.", file=stdout)
        else:
            print(f"Password updated for '{result.username}'.", file=stdout)
        return 0
    finally:
        if owns_engine:
            engine.dispose()


def create_account() -> None:
    """Entry point for `create-account`."""
    raise SystemExit(run())
