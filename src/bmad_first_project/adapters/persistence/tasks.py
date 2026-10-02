"""The SQL `TaskRepository`. Never commits, orders or raises domain errors."""

from dataclasses import replace

from sqlalchemy import select
from sqlalchemy.orm import Session

from bmad_first_project.adapters.persistence.tables import TaskRow
from bmad_first_project.domain.task import Task, TaskStatus


def _to_domain(row: TaskRow) -> Task:
    return Task(
        id=row.id,
        title=row.title,
        description=row.description,
        due_at=row.due_at,
        status=TaskStatus(row.status),
        created_at=row.created_at,
        finished_at=row.finished_at,
        previous_status=(
            None if row.previous_status is None else TaskStatus(row.previous_status)
        ),
    )


def _status_value(status: TaskStatus | None) -> str | None:
    return None if status is None else status.value


class SqlTaskRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, task: Task) -> Task:
        row = TaskRow(
            title=task.title,
            description=task.description,
            due_at=task.due_at,
            status=task.status.value,
            created_at=task.created_at,
            finished_at=task.finished_at,
            previous_status=_status_value(task.previous_status),
        )
        self._session.add(row)
        self._session.flush()
        return replace(task, id=row.id)

    def get(self, task_id: int) -> Task | None:
        row = self._session.get(TaskRow, task_id)
        return None if row is None else _to_domain(row)

    def list(self) -> list[Task]:
        # No ORDER BY: the order belongs to the domain.
        rows = self._session.scalars(select(TaskRow)).all()
        return [_to_domain(row) for row in rows]

    def save(self, task: Task) -> None:
        row = None if task.id is None else self._session.get(TaskRow, task.id)
        if row is None:
            raise LookupError("Only a task returned by `get` can be saved.")
        row.title = task.title
        row.description = task.description
        row.due_at = task.due_at
        row.status = task.status.value
        row.created_at = task.created_at
        row.finished_at = task.finished_at
        row.previous_status = _status_value(task.previous_status)
        self._session.flush()
