"""`create_task`, `list_tasks`, `get_task` and `edit_task` against an in-memory unit
of work."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

import pytest

from bmad_first_project.application.tasks import (
    create_task,
    delete_task,
    edit_task,
    get_task,
    list_tasks,
)
from bmad_first_project.domain.errors import (
    DomainValidationError,
    NotFoundError,
    StateConflictError,
)
from bmad_first_project.domain.task import (
    BLANK_TITLE_MESSAGE,
    FINISHED_TASK_MESSAGE,
    NOT_DELETABLE_MESSAGE,
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
        self.saves: list[Task] = []
        self.deletes: list[int] = []

    def add(self, task: Task) -> Task:
        stored = replace(task, id=len(self.rows) + 1)
        self.rows.append(stored)
        return stored

    def get(self, task_id: int) -> Task | None:
        self.gets.append(task_id)
        return next((t for t in self.rows if t.id == task_id), None)

    def list(self) -> list[Task]:
        return list(self.rows)

    def save(self, task: Task) -> None:
        self.saves.append(task)
        index = next((i for i, t in enumerate(self.rows) if t.id == task.id), None)
        if task.id is None or index is None:
            raise LookupError("Only a task returned by `get` can be saved.")
        self.rows[index] = task

    def delete(self, task_id: int) -> None:
        self.deletes.append(task_id)
        self.rows = [t for t in self.rows if t.id != task_id]


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


def test_edit_saves_the_changed_task_and_returns_its_view(
    uow: FakeUnitOfWork,
) -> None:
    task = create_task(uow, NOW, "Pay rent", "By card", TOMORROW).task
    assert task.id is not None
    later = TOMORROW + timedelta(microseconds=1)

    view = edit_task(uow, later, task.id, title=" Pay the rent ")

    expected = replace(task, title="Pay the rent")
    assert view == TaskView(task=expected, is_overdue=True)
    assert uow.tasks.saves == [expected]
    assert uow.tasks.rows == [expected]


def test_edit_with_nothing_set_saves_the_task_unchanged(uow: FakeUnitOfWork) -> None:
    task = create_task(uow, NOW, "Pay rent", None, TOMORROW).task
    assert task.id is not None

    assert edit_task(uow, NOW, task.id) == TaskView(task=task, is_overdue=False)
    assert uow.tasks.rows == [task]


@pytest.mark.parametrize("task_id", [999, 0, -1])
def test_edit_of_a_missing_id_is_not_found_before_any_rule(
    uow: FakeUnitOfWork, task_id: int
) -> None:
    create_task(uow, NOW, "Pay rent", None, TOMORROW)

    with pytest.raises(NotFoundError) as caught:
        edit_task(uow, NOW, task_id, title="")

    assert caught.value.message == TASK_NOT_FOUND_MESSAGE
    assert uow.tasks.saves == []


@pytest.mark.parametrize("task_id", [2**63, -(2**63) - 1])
def test_edit_of_an_id_outside_int64_is_not_found_without_asking_the_repository(
    uow: FakeUnitOfWork, task_id: int
) -> None:
    with pytest.raises(NotFoundError):
        edit_task(uow, NOW, task_id, title="New")

    assert uow.tasks.gets == []
    assert uow.tasks.saves == []


@pytest.mark.parametrize("status", [TaskStatus.DONE, TaskStatus.CANCELLED])
def test_edit_of_a_finished_task_is_a_state_conflict_before_any_rule(
    uow: FakeUnitOfWork, status: TaskStatus
) -> None:
    finished = uow.tasks.add(
        replace(new_task("Pay rent", None, TOMORROW, NOW), status=status)
    )
    assert finished.id is not None

    with pytest.raises(StateConflictError) as caught:
        edit_task(uow, NOW, finished.id, title="", due_at=NOW - timedelta(days=1))

    assert caught.value.message == FINISHED_TASK_MESSAGE
    assert caught.value.reason is None
    assert uow.tasks.saves == []
    assert uow.tasks.rows == [finished]


def test_a_broken_rule_on_edit_saves_nothing(uow: FakeUnitOfWork) -> None:
    task = create_task(uow, NOW, "Pay rent", None, TOMORROW).task
    assert task.id is not None

    with pytest.raises(DomainValidationError) as caught:
        edit_task(uow, NOW, task.id, title="", due_at=NOW - timedelta(days=1))

    assert caught.value.message == BLANK_TITLE_MESSAGE
    assert uow.tasks.saves == []
    assert uow.tasks.rows == [task]


def test_delete_removes_a_to_do_task(uow: FakeUnitOfWork) -> None:
    kept = create_task(uow, NOW, "Keep", None, TOMORROW).task
    task = create_task(uow, NOW, "Pay rent", None, TOMORROW).task
    assert task.id is not None

    delete_task(uow, task.id)

    assert uow.tasks.deletes == [task.id]
    assert uow.tasks.rows == [kept]


@pytest.mark.parametrize("task_id", [999, -1, 2**63, -(2**63) - 1])
def test_delete_of_a_missing_id_is_not_found(uow: FakeUnitOfWork, task_id: int) -> None:
    with pytest.raises(NotFoundError) as caught:
        delete_task(uow, task_id)

    assert caught.value.message == TASK_NOT_FOUND_MESSAGE
    assert uow.tasks.deletes == []


@pytest.mark.parametrize(
    "status", [TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.CANCELLED]
)
def test_delete_of_a_task_not_to_do_is_a_state_conflict(
    uow: FakeUnitOfWork, status: TaskStatus
) -> None:
    task = uow.tasks.add(
        replace(new_task("Pay rent", None, TOMORROW, NOW), status=status)
    )
    assert task.id is not None

    with pytest.raises(StateConflictError) as caught:
        delete_task(uow, task.id)

    assert caught.value.message == NOT_DELETABLE_MESSAGE
    assert uow.tasks.deletes == []
    assert uow.tasks.rows == [task]
