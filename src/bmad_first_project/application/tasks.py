"""Use cases for tasks."""

from datetime import datetime
from typing import Literal

from bmad_first_project.application.ports import UnitOfWork
from bmad_first_project.domain.errors import NotFoundError
from bmad_first_project.domain.task import (
    TASK_NOT_FOUND_MESSAGE,
    UNSET,
    Task,
    TaskView,
    Unset,
    check_deletable,
    new_task,
    order_tasks,
    view_task,
)
from bmad_first_project.domain.task import edit_task as edit_domain_task

# `TaskRepository.get` takes only 64-bit signed IDs; no task exists outside them.
_MIN_TASK_ID = -(2**63)
_MAX_TASK_ID = 2**63 - 1


def create_task(
    uow: UnitOfWork,
    now: datetime,
    title: str,
    description: str | None,
    due_at: datetime,
) -> TaskView:
    """Create a To do task at `now`, store it, and return how it looks at `now`.

    `uow` must be active; the caller commits it. Every value rule comes from `new_task`; a broken one raises
    `DomainValidationError` before anything is stored.
    """
    task = uow.tasks.add(new_task(title, description, due_at, now))
    return view_task(task, now)


def list_tasks(uow: UnitOfWork, now: datetime) -> list[TaskView]:
    """Every task as it looks at `now`, in the domain's urgency order.

    `uow` must be active.
    """
    return [view_task(task, now) for task in order_tasks(uow.tasks.list())]


def get_task(uow: UnitOfWork, now: datetime, task_id: int) -> TaskView:
    """The task with this ID as it looks at `now`.

    `uow` must be active. A missing ID, or one outside the 64-bit range (checked
    before the repository is asked), raises `NotFoundError`.
    """
    return view_task(_existing(uow, task_id), now)


def edit_task(
    uow: UnitOfWork,
    now: datetime,
    task_id: int,
    *,
    title: str | Literal[Unset.UNSET] = UNSET,
    description: str | None | Literal[Unset.UNSET] = UNSET,
    due_at: datetime | Literal[Unset.UNSET] = UNSET,
) -> TaskView:
    """Change the given fields of a task, store it, and return how it looks at `now`.

    `uow` must be active; the caller commits it. A field left as `UNSET` is
    unchanged. A missing ID raises `NotFoundError`, then a finished task
    `StateConflictError`, then a broken rule `DomainValidationError`; each is
    raised before anything is saved.
    """
    task = _existing(uow, task_id)
    edited = edit_domain_task(
        task, now, title=title, description=description, due_at=due_at
    )
    uow.tasks.save(edited)
    return view_task(edited, now)


def delete_task(uow: UnitOfWork, task_id: int) -> None:
    """Permanently delete a To do task.

    `uow` must be active; the caller commits it. A missing ID raises
    `NotFoundError`, then a task that isn't To do `StateConflictError`; nothing
    is deleted on either.
    """
    task = _existing(uow, task_id)
    check_deletable(task)
    uow.tasks.delete(task_id)


def _existing(uow: UnitOfWork, task_id: int) -> Task:
    """The stored task with this ID; a missing or out-of-range ID is not found."""
    if not _MIN_TASK_ID <= task_id <= _MAX_TASK_ID:
        raise NotFoundError(TASK_NOT_FOUND_MESSAGE)
    task = uow.tasks.get(task_id)
    if task is None:
        raise NotFoundError(TASK_NOT_FOUND_MESSAGE)
    return task
