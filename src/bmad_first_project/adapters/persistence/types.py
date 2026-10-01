"""Column types shared by every table."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, Dialect
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    """An aware datetime stored as naive UTC with microseconds; UTC re-attached on read.

    Naive datetimes are rejected with `ValueError` before reaching the database.
    """

    impl = DateTime(timezone=False)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise TypeError(f"UTCDateTime expects a datetime, got {type(value)!r}")
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError(f"UTCDateTime refuses a naive datetime: {value!r}")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)
