"""`create_task`, `list_tasks` and `get_task` against an in-memory unit of work."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

import pytest

from bmad_first_project.application.tasks import create_task, get_task, list_tasks
from bmad_first_project.domain.errors import DomainValidationError, NotFoundError
from bmad_first_project.domain.task import (
    PAST_DUE_MESSAGE,
    TASK_NOT_FOUND_MESSAGE,
    Task,
    TaskStatus,
    TaskView,
    new_task,
)

NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)
TOMORROW = NOW + timedelta(days=1)


class MemoryTasks:
    def __init__(self) -> None:
        self.rows: list[Task] = []
        self.gets: list[int] = []

    def add(self, task: Task) -> Task:
        stored = replace(task, id=len(self.rows) + 1)
        self.rows.append(stored)
        return stored

    def get(self, task_id: int) -> Task | None:
        self.gets.append(task_id)
        return next((t for t in self.rows if t.id == task_id), None)

    def list(self) -> list[Task]:
        return list(self.rows)


class FakeUnitOfWork:
    def __init__(self) -> None:
        self._tasks = MemoryTasks()

    @property
    def tasks(self) -> MemoryTasks:
        return self._tasks

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        pass


@pytest.fixture
def uow() -> FakeUnitOfWork:
    return FakeUnitOfWork()


def test_create_stores_the_task_and_returns_its_view(uow: FakeUnitOfWork) -> None:
    view = create_task(uow, NOW, " Pay rent ", None, TOMORROW)

    expected = Task(
        id=1,
        title="Pay rent",
        description=None,
        due_at=TOMORROW,
        status=TaskStatus.TO_DO,
        created_at=NOW,
    )
    assert view == TaskView(task=expected, is_overdue=False)
    assert uow.tasks.rows == [expected]


def test_a_broken_rule_stores_nothing(uow: FakeUnitOfWork) -> None:
    past = NOW - timedelta(microseconds=1)

    with pytest.raises(DomainValidationError) as caught:
        create_task(uow, NOW, "Pay rent", None, past)

    assert caught.value.message == PAST_DUE_MESSAGE
    assert uow.tasks.rows == []


def test_list_is_empty_without_tasks(uow: FakeUnitOfWork) -> None:
    assert list_tasks(uow, NOW) == []


def test_list_is_in_urgency_order_and_viewed_at_now(uow: FakeUnitOfWork) -> None:
    later = create_task(uow, NOW, "Later", None, TOMORROW + timedelta(hours=1)).task
    sooner = create_task(uow, NOW, "Sooner", None, TOMORROW).task
    in_progress = uow.tasks.add(
        replace(new_task("Started", None, TOMORROW, NOW), status=TaskStatus.IN_PROGRESS)
    )
    after = TOMORROW + timedelta(microseconds=1)

    views = list_tasks(uow, after)

    assert views == [
        TaskView(task=in_progress, is_overdue=True),
        TaskView(task=sooner, is_overdue=True),
        TaskView(task=later, is_overdue=False),
    ]


def test_get_returns_the_view_at_now(uow: FakeUnitOfWork) -> None:
    task = create_task(uow, NOW, "Pay rent", None, TOMORROW).task
    assert task.id is not None

    assert get_task(uow, NOW, task.id) == TaskView(task=task, is_overdue=False)
    assert get_task(uow, TOMORROW + timedelta(microseconds=1), task.id).is_overdue


@pytest.mark.parametrize("task_id", [999, 0, -1])
def test_get_of_a_missing_id_is_not_found(uow: FakeUnitOfWork, task_id: int) -> None:
    create_task(uow, NOW, "Pay rent", None, TOMORROW)

    with pytest.raises(NotFoundError) as caught:
        get_task(uow, NOW, task_id)

    assert caught.value.message == TASK_NOT_FOUND_MESSAGE


@pytest.mark.parametrize(
    "task_id",
    [
        pytest.param(2**63, id="above-int64"),
        pytest.param(-(2**63) - 1, id="below-int64"),
    ],
)
def test_an_id_outside_int64_is_not_found_without_asking_the_repository(
    uow: FakeUnitOfWork, task_id: int
) -> None:
    with pytest.raises(NotFoundError) as caught:
        get_task(uow, NOW, task_id)

    assert caught.value.message == TASK_NOT_FOUND_MESSAGE
    assert uow.tasks.gets == []


@pytest.mark.parametrize("task_id", [2**63 - 1, -(2**63)])
def test_the_int64_bounds_are_asked_of_the_repository(
    uow: FakeUnitOfWork, task_id: int
) -> None:
    with pytest.raises(NotFoundError):
        get_task(uow, NOW, task_id)

    assert uow.tasks.gets == [task_id]
