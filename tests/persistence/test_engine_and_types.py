"""`make_engine` and `UTCDateTime` keep SQLite honest about keys and time."""

import threading
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import (
    Column,
    Engine,
    ForeignKey,
    Integer,
    MetaData,
    Table,
    exc,
    select,
    text,
)

from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.adapters.persistence.types import UTCDateTime


@pytest.fixture
def scratch(tmp_path: Path) -> tuple[Engine, Table]:
    """A test-only table on its own engine; the app never creates tables."""
    engine = make_engine(f"sqlite:///{tmp_path / 'scratch.db'}")
    metadata = MetaData()
    table = Table(
        "scratch_times",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("at", UTCDateTime, nullable=True),
    )
    metadata.create_all(engine)
    return engine, table


def test_foreign_keys_are_on_for_every_connection(tmp_path: Path) -> None:
    engine = make_engine(f"sqlite:///{tmp_path / 'fk.db'}")

    for _ in range(2):
        with engine.connect() as connection:
            assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1
        engine.dispose()


def test_foreign_key_violation_is_rejected(tmp_path: Path) -> None:
    engine = make_engine(f"sqlite:///{tmp_path / 'fk-violation.db'}")
    metadata = MetaData()
    Table("parent", metadata, Column("id", Integer, primary_key=True))
    child = Table(
        "child",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("parent_id", Integer, ForeignKey("parent.id"), nullable=False),
    )
    metadata.create_all(engine)

    try:
        with pytest.raises(exc.IntegrityError), engine.begin() as connection:
            connection.execute(child.insert().values(id=1, parent_id=999))
    finally:
        engine.dispose()


def test_foreign_keys_are_on_in_memory() -> None:
    engine = make_engine("sqlite://")

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_parent_directory_is_created(tmp_path: Path) -> None:
    db_file = tmp_path / "a" / "b" / "app.db"

    engine = make_engine(f"sqlite:///{db_file}")
    with engine.connect():
        pass

    assert db_file.exists()


def test_connection_is_usable_from_another_thread(tmp_path: Path) -> None:
    engine = make_engine(f"sqlite:///{tmp_path / 'thread.db'}")
    connection = engine.connect()
    errors: list[BaseException] = []

    def use() -> None:
        try:
            connection.execute(text("SELECT 1"))
        except BaseException as error:  # noqa: BLE001
            errors.append(error)

    worker = threading.Thread(target=use)
    worker.start()
    worker.join()
    connection.close()

    assert errors == []


def test_aware_datetime_round_trips_as_utc_with_microseconds(
    scratch: tuple[Engine, Table],
) -> None:
    engine, table = scratch
    written = datetime.fromisoformat("2026-10-01T12:30:45.123456+02:00")

    with engine.begin() as connection:
        connection.execute(table.insert().values(id=1, at=written))
    with engine.connect() as connection:
        read = connection.execute(select(table.c.at)).scalar_one()
        raw = connection.execute(text("SELECT at FROM scratch_times")).scalar_one()

    assert read.isoformat() == "2026-10-01T10:30:45.123456+00:00"
    assert read.tzinfo is UTC
    assert read == written
    assert raw == "2026-10-01 10:30:45.123456"


def test_null_round_trips(scratch: tuple[Engine, Table]) -> None:
    engine, table = scratch

    with engine.begin() as connection:
        connection.execute(table.insert().values(id=1, at=None))
        assert connection.execute(select(table.c.at)).scalar_one() is None


def test_naive_datetime_is_rejected_before_the_database(
    scratch: tuple[Engine, Table],
) -> None:
    engine, table = scratch
    naive = datetime(2026, 10, 1, 12, 30)  # noqa: DTZ001

    with pytest.raises(ValueError, match="naive"):
        UTCDateTime().process_bind_param(naive, engine.dialect)
    with pytest.raises(exc.StatementError) as caught, engine.begin() as connection:
        connection.execute(table.insert().values(id=1, at=naive))

    assert isinstance(caught.value.orig, ValueError)
    with engine.connect() as connection:
        assert connection.execute(select(table.c.id)).all() == []


def test_non_utc_offset_is_converted_not_relabelled() -> None:
    plus_five = datetime(2026, 10, 1, 5, 0, tzinfo=timezone(timedelta(hours=5)))

    stored = UTCDateTime().process_bind_param(
        plus_five, make_engine("sqlite://").dialect
    )

    assert stored == datetime(2026, 10, 1, 0, 0)  # noqa: DTZ001
