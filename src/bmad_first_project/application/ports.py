"""Ports the application layer depends on."""

from datetime import datetime
from typing import Protocol


class Clock(Protocol):
    """The single source of "now". Implementations return aware UTC datetimes."""

    def now(self) -> datetime: ...
