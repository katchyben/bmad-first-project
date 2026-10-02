"""`create_task` against an in-memory unit of work."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

import pytest

from bmad_first_project.application.tasks import create_task
from bmad_first_project.domain.errors import DomainValidationError
from bmad_first_project.domain.task import (
    PAST_DUE_MESSAGE,
    Task,
    TaskStatus,
    TaskView,
)

NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)
TOMORROW = NOW + timedelta(days=1)


class MemoryTasks:
    def __init__(self) -> None:
        self.rows: list[Task] = []

    def add(self, task: Task) -> Task:
        stored = replace(task, id=len(self.rows) + 1)
        self.rows.append(stored)
        return stored

    def get(self, task_id: int) -> Task | None:
        return next((t for t in self.rows if t.id == task_id), None)


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
