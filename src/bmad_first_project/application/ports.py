"""Ports the application layer depends on."""

from datetime import datetime
from types import TracebackType
from typing import Protocol, Self


class Clock(Protocol):
    """The single source of "now". Implementations return aware UTC datetimes."""

    def now(self) -> datetime: ...


class UnitOfWork(Protocol):
    """One transaction, used as a context manager.

    `__enter__` returns the unit of work itself. `__exit__` commits on a clean
    exit; otherwise it rolls back and lets the exception propagate.
    """

    def __enter__(self) -> Self: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...
