"""Ports the application layer depends on."""

from datetime import datetime
from types import TracebackType
from typing import Protocol, Self

from bmad_first_project.domain.account import Account
from bmad_first_project.domain.session import UserSession
from bmad_first_project.domain.task import Task


class Clock(Protocol):
    """The single source of "now". Implementations return aware UTC datetimes."""

    def now(self) -> datetime: ...


class PasswordHasher(Protocol):
    """Turns a plain password into a one-way hash and checks one against it."""

    def hash(self, password: str) -> str: ...

    def verify(self, password: str, password_hash: str) -> bool: ...


class AccountStore(Protocol):
    """The app's single account. Never commits; the unit of work does."""

    def get(self) -> Account | None:
        """The account, or None when it hasn't been created yet."""
        ...

    def add(self, account: Account) -> None: ...

    def save(self, account: Account) -> None:
        """Write the changes to an account previously returned by `get`."""
        ...


class SessionStore(Protocol):
    """Login sessions, looked up by token hash. Never commits; the unit of work does."""

    def add(self, session: UserSession) -> None: ...

    def get(self, token_hash: str) -> UserSession | None:
        """The session with this token hash, or None when there is none."""
        ...

    def delete(self, token_hash: str) -> None:
        """Delete the session with this token hash, if it exists."""
        ...

    def delete_all(self) -> None: ...


class TaskRepository(Protocol):
    """Tasks by ID. Never commits, orders or raises domain errors; the use case does."""

    def add(self, task: Task) -> Task:
        """Store a new task and return it with its database ID."""
        ...

    def get(self, task_id: int) -> Task | None:
        """The task with this ID, or None when there is none.

        `task_id` must be a 64-bit signed integer; callers check the range.
        """
        ...

    def list(self) -> list[Task]:
        """Every stored task, in no particular order."""
        ...


class UnitOfWork(Protocol):
    """One transaction, used as a context manager.

    `__enter__` returns the unit of work itself. `__exit__` commits on a clean
    exit; otherwise it rolls back and lets the exception propagate. The stores
    are available only while it is active.
    """

    @property
    def accounts(self) -> AccountStore: ...

    @property
    def sessions(self) -> SessionStore: ...

    @property
    def tasks(self) -> TaskRepository: ...

    def __enter__(self) -> Self: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...
