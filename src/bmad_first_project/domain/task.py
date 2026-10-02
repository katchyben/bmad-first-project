"""A task: its shape, its statuses, the value rules for creating one, its view
and the list order."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum

from bmad_first_project.domain.errors import DomainValidationError

TITLE_MAX_LENGTH = 200
DESCRIPTION_MAX_LENGTH = 5000

BLANK_TITLE_MESSAGE = "Enter a title."
TITLE_TOO_LONG_MESSAGE = "Keep the title to 200 characters or fewer."
DESCRIPTION_TOO_LONG_MESSAGE = "Keep the description to 5,000 characters or fewer."
PAST_DUE_MESSAGE = "That time has already passed."
TASK_NOT_FOUND_MESSAGE = "That task no longer exists."


class TaskStatus(StrEnum):
    """Where a task is in its life. The value is what the database stores."""

    TO_DO = "to_do"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class Task:
    """One task. Datetimes are aware; `id` is None until the task is stored."""

    title: str
    description: str | None
    due_at: datetime
    status: TaskStatus
    created_at: datetime
    finished_at: datetime | None = None
    previous_status: TaskStatus | None = None
    id: int | None = None


def _require_aware(value: datetime, name: str) -> datetime:
    """A naive datetime is a programming error, not a user mistake."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware, got {value!r}")
    return value


def normalise_title(raw: str) -> str:
    """Trim the title; it must then be 1 to 200 code points."""
    title = raw.strip()
    if not title:
        raise DomainValidationError(BLANK_TITLE_MESSAGE)
    if len(title) > TITLE_MAX_LENGTH:
        raise DomainValidationError(TITLE_TOO_LONG_MESSAGE)
    return title


def normalise_description(raw: str | None) -> str | None:
    """At most 5,000 code points, never trimmed. An empty description is None."""
    if not raw:
        return None
    if len(raw) > DESCRIPTION_MAX_LENGTH:
        raise DomainValidationError(DESCRIPTION_TOO_LONG_MESSAGE)
    return raw


def check_due_at(due_at: datetime, now: datetime) -> datetime:
    """`due_at` must not be before `now`; exactly `now` is accepted."""
    _require_aware(due_at, "due_at")
    _require_aware(now, "now")
    if due_at < now:
        raise DomainValidationError(PAST_DUE_MESSAGE)
    return due_at


def new_task(
    title: str, description: str | None, due_at: datetime, now: datetime
) -> Task:
    """A new To do task created at `now`, with every value rule applied.

    `due_at` is checked (which also rejects a naive `due_at` or `now`) before
    `now` is used, and both are stored in UTC.
    """
    return Task(
        title=normalise_title(title),
        description=normalise_description(description),
        due_at=check_due_at(due_at, now).astimezone(UTC),
        status=TaskStatus.TO_DO,
        created_at=now.astimezone(UTC),
    )


@dataclass(frozen=True)
class TaskView:
    """A task as seen at one `now`: overdue is computed here, never stored."""

    task: Task
    is_overdue: bool


def view_task(task: Task, now: datetime) -> TaskView:
    """The task seen at `now`: overdue exactly when `due_at` is before `now`."""
    _require_aware(now, "now")
    return TaskView(task=task, is_overdue=task.due_at < now)


def _urgency_key(task: Task) -> tuple[datetime, int, datetime, int]:
    if task.id is None:
        raise ValueError(f"only stored tasks can be ordered, got {task!r}")
    in_progress_first = 0 if task.status is TaskStatus.IN_PROGRESS else 1
    return (task.due_at, in_progress_first, task.created_at, task.id)


def order_tasks(tasks: Iterable[Task]) -> list[Task]:
    """Stored active tasks in urgency order, as a new list.

    `due_at` ascending, then In progress before To do, then `created_at`
    ascending, then `id` ascending, so the order never depends on the input.
    Where finished tasks go is Epic 3's to decide.
    """
    return sorted(tasks, key=_urgency_key)
