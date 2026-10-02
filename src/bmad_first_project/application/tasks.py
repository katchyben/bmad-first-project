"""Use cases for tasks."""

from datetime import datetime

from bmad_first_project.application.ports import UnitOfWork
from bmad_first_project.domain.task import TaskView, new_task, view_task


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
