"""The single factory for every SQLAlchemy engine."""

from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url

__all__ = ["Engine", "make_engine"]


def _sqlite_file(database: str | None) -> Path | None:
    """Return the file behind a SQLite database name, or None for in-memory."""
    if not database or database == ":memory:" or database.startswith("file:"):
        return None
    return Path(database)


def _enable_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def make_engine(url: str) -> Engine:
    """Build an engine. For SQLite: foreign keys on, any-thread use, parent dir made."""
    parsed = make_url(url)
    is_sqlite = parsed.get_backend_name() == "sqlite"
    connect_args: dict[str, Any] = {}
    if is_sqlite:
        connect_args["check_same_thread"] = False
        path = _sqlite_file(parsed.database)
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(parsed, connect_args=connect_args)
    if is_sqlite:
        event.listen(engine, "connect", _enable_foreign_keys)
    return engine
