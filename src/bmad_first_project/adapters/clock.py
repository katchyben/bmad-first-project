"""System clock adapter: the only module allowed to read the wall clock."""

from datetime import UTC, datetime


class SystemClock:
    """A `Clock` backed by the system wall clock."""

    def now(self) -> datetime:
        return datetime.now(UTC)
