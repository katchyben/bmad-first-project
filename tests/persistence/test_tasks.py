"""The `tasks` table, its migration and `SqlTaskRepository` through the unit of work."""

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta, timezone

import pytest
from alembic import command
from sqlalchemy import Engine, exc, inspect, text

from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.adapters.persistence.schema import (
    alembic_config,
    assert_schema_current,
)
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.domain.task import Task, TaskStatus, new_task

NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)
PLUS_TWO = timezone(timedelta(hours=2))


def _task(title: str = "Pay rent") -> Task:
    return new_task(title, "First of the month", NOW + timedelta(days=1), NOW)


def _count(engine: Engine) -> int:
    with engine.connect() as connection:
        return connection.execute(text("SELECT count(*) FROM tasks")).scalar_one()


def test_migration_reaches_head_with_the_tasks_table(migrated_engine: Engine) -> None:
    with migrated_engine.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version"))
        assert version.scalar_one() == "0004"
    assert_schema_current(migrated_engine)

    inspector = inspect(migrated_engine)
    columns = {c["name"]: c for c in inspector.get_columns("tasks")}
    nullable = {name: column["nullable"] for name, column in columns.items()}

    assert nullable == {
        "id": False,
        "title": False,
        "description": True,
        "due_at": False,
        "status": False,
        "created_at": False,
        "finished_at": True,
        "previous_status": True,
    }
    assert all(column.get("default") is None for column in columns.values())
    assert inspector.get_pk_constraint("tasks")["name"] == "pk_tasks"
    assert {c["name"] for c in inspector.get_check_constraints("tasks")} == {
        "ck_tasks_status",
        "ck_tasks_previous_status",
    }
    assert inspector.get_indexes("tasks") == []
    assert inspector.get_unique_constraints("tasks") == []
    assert inspector.get_foreign_keys("tasks") == []


def test_downgrade_drops_only_the_tasks_table(
    database_url: str, upgrade: Callable[[str], None]
) -> None:
    upgrade(database_url)
    config = alembic_config()
    config.attributes["url"] = database_url
    command.downgrade(config, "0003")

    engine = make_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert "tasks" not in tables
        assert {"account", "sessions"} <= tables
    finally:
        engine.dispose()


def test_add_returns_the_task_with_its_id_and_get_round_trips(
    migrated_engine: Engine,
) -> None:
    due = (NOW + timedelta(days=1)).astimezone(PLUS_TWO)
    task = new_task("Pay rent", "First of the month", due, NOW)

    with SqlUnitOfWork(migrated_engine) as uow:
        added = uow.tasks.add(task)

    assert added.id is not None
    assert added == replace(task, id=added.id)
    assert added.due_at.tzinfo is UTC

    with SqlUnitOfWork(migrated_engine) as uow:
        stored = uow.tasks.get(added.id)

    assert stored == added
    assert stored.status is TaskStatus.TO_DO
    assert stored.due_at.tzinfo is UTC
    assert stored.due_at == NOW + timedelta(days=1)
    assert stored.created_at == NOW and stored.created_at.tzinfo is UTC
    assert stored.finished_at is None and stored.previous_status is None


@pytest.mark.parametrize("status", list(TaskStatus))
def test_every_status_round_trips_through_the_schema(
    migrated_engine: Engine, status: TaskStatus
) -> None:
    task = Task(
        title="Any status",
        description=None,
        due_at=NOW,
        status=status,
        created_at=NOW,
        finished_at=NOW + timedelta(hours=3),
        previous_status=status,
    )

    with SqlUnitOfWork(migrated_engine) as uow:
        added = uow.tasks.add(task)
    assert added.id is not None
    with SqlUnitOfWork(migrated_engine) as uow:
        stored = uow.tasks.get(added.id)

    assert stored == added
    with migrated_engine.connect() as connection:
        row = connection.execute(
            text("SELECT status, previous_status FROM tasks")
        ).one()
    assert tuple(row) == (status.value, status.value)


def test_ids_are_distinct(migrated_engine: Engine) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        first = uow.tasks.add(_task("One"))
        second = uow.tasks.add(_task("Two"))

    assert first.id is not None and second.id is not None
    assert first.id != second.id


def test_get_of_a_missing_id_returns_none(migrated_engine: Engine) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.tasks.get(999) is None


def test_list_returns_every_stored_task(migrated_engine: Engine) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.tasks.list() == []
        added = [uow.tasks.add(_task(title)) for title in ("One", "Two", "Three")]

    with SqlUnitOfWork(migrated_engine) as uow:
        listed = uow.tasks.list()

    assert sorted(listed, key=lambda task: task.id or 0) == added
    assert all(task.due_at.tzinfo is UTC for task in listed)


def test_save_writes_the_whole_task_by_its_id(migrated_engine: Engine) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        kept = uow.tasks.add(_task("Kept"))
        added = uow.tasks.add(_task())
    assert added.id is not None and kept.id is not None
    changed = replace(
        added,
        title="Pay rent by card",
        description=None,
        due_at=(NOW + timedelta(days=3)).astimezone(PLUS_TWO),
        status=TaskStatus.DONE,
        created_at=NOW - timedelta(days=1),
        finished_at=NOW + timedelta(hours=1),
        previous_status=TaskStatus.IN_PROGRESS,
    )

    with SqlUnitOfWork(migrated_engine) as uow:
        uow.tasks.save(changed)

    with SqlUnitOfWork(migrated_engine) as uow:
        stored = uow.tasks.get(added.id)
        assert uow.tasks.get(kept.id) == kept

    assert stored == changed
    assert stored is not None and stored.due_at.tzinfo is UTC
    assert _count(migrated_engine) == 2


def test_a_rolled_back_save_changes_nothing(migrated_engine: Engine) -> None:
    class Boom(Exception):
        pass

    with SqlUnitOfWork(migrated_engine) as uow:
        added = uow.tasks.add(_task())
    assert added.id is not None

    with pytest.raises(Boom), SqlUnitOfWork(migrated_engine) as uow:
        uow.tasks.save(replace(added, title="Changed"))
        raise Boom

    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.tasks.get(added.id) == added


@pytest.mark.parametrize("task_id", [None, 999])
def test_save_of_an_unstored_task_is_a_lookup_error(
    migrated_engine: Engine, task_id: int | None
) -> None:
    with pytest.raises(LookupError), SqlUnitOfWork(migrated_engine) as uow:
        uow.tasks.save(replace(_task(), id=task_id))

    assert _count(migrated_engine) == 0


def test_rollback_stores_nothing(migrated_engine: Engine) -> None:
    class Boom(Exception):
        pass

    with pytest.raises(Boom), SqlUnitOfWork(migrated_engine) as uow:
        uow.tasks.add(_task())
        raise Boom

    assert _count(migrated_engine) == 0


@pytest.mark.parametrize("column", ["status", "previous_status"])
def test_check_rejects_an_unknown_status(migrated_engine: Engine, column: str) -> None:
    previous = "'nope'" if column == "previous_status" else "NULL"
    status = "'nope'" if column == "status" else "'to_do'"
    insert = text(
        "INSERT INTO tasks (title, due_at, status, created_at, previous_status) "
        f"VALUES ('t', '2026-10-02 00:00:00.000000', {status}, "
        f"'2026-10-01 00:00:00.000000', {previous})"
    )

    with (
        pytest.raises(exc.IntegrityError, match=f"ck_tasks_{column}"),
        migrated_engine.begin() as connection,
    ):
        connection.execute(insert)


def test_tasks_is_unavailable_outside_the_unit_of_work(
    migrated_engine: Engine,
) -> None:
    uow = SqlUnitOfWork(migrated_engine)

    with pytest.raises(RuntimeError):
        _ = uow.tasks
    with uow:
        _ = uow.tasks
    with pytest.raises(RuntimeError):
        _ = uow.tasks


def test_delete_removes_only_that_task(migrated_engine: Engine) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        kept = uow.tasks.add(_task("Kept"))
        gone = uow.tasks.add(_task("Gone"))
    assert gone.id is not None

    with SqlUnitOfWork(migrated_engine) as uow:
        uow.tasks.delete(gone.id)
        uow.tasks.delete(999)

    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.tasks.get(gone.id) is None
        assert uow.tasks.list() == [kept]


def test_delete_after_get_in_one_unit_of_work_leaves_nothing_cached(
    migrated_engine: Engine,
) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        task = uow.tasks.add(_task())
    assert task.id is not None

    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.tasks.get(task.id) == task
        uow.tasks.delete(task.id)
        assert uow.tasks.get(task.id) is None
        assert uow.tasks.list() == []
