"""Task routes. Bodies are checked for shape only; the domain owns every value rule."""

from datetime import UTC, datetime
from typing import Annotated, Self

from fastapi import APIRouter, Response
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    field_validator,
)
from pydantic.json_schema import SkipJsonSchema

from bmad_first_project.adapters.http.dependencies import (
    CurrentSessionDep,
    NowDep,
    UnitOfWorkDep,
)
from bmad_first_project.adapters.http.errors import error_responses
from bmad_first_project.application import tasks
from bmad_first_project.domain.task import TaskStatus, TaskView

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _require_string(value: object) -> object:
    """Only an ISO 8601 string is a date-time on the wire, never a number.

    `Strict()` can't do this: FastAPI validates the parsed body in Python mode,
    where strict datetimes reject strings too.
    """
    if not isinstance(value, str):
        # Pydantic turns only ValueError into a 422; a TypeError would be a 500.
        raise ValueError("due_at must be an ISO 8601 string")  # noqa: TRY004
    return value


def _to_utc(value: datetime) -> datetime:
    """Convert to UTC at the boundary; a value UTC can't hold is a shape error."""
    try:
        return value.astimezone(UTC)
    except OverflowError as error:
        raise ValueError("due_at is out of range in UTC") from error


# An ISO 8601 string with an offset, converted to UTC; shared by create and edit.
DueAt = Annotated[
    AwareDatetime, BeforeValidator(_require_string), AfterValidator(_to_utc)
]


class CreateTaskBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    due_at: DueAt


# A partial edit: an omitted key is unchanged, so check `model_fields_set`.
# `description: null` clears it; `title` and `due_at` can't be null. The None
# defaults only mark a key as omitted and are left out of the schema.
class EditTaskBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | None = None
    due_at: DueAt | SkipJsonSchema[None] = None

    @field_validator("title", "due_at", mode="before")
    @classmethod
    def _not_null(cls, value: object) -> object:
        # Runs only for keys that were sent; defaults aren't validated.
        if value is None:
            raise ValueError("this field can't be null")
        return value


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str | None
    due_at: datetime
    status: TaskStatus
    created_at: datetime
    finished_at: datetime | None
    is_overdue: bool

    @classmethod
    def from_view(cls, view: TaskView) -> Self:
        task = view.task
        if task.id is None:
            raise RuntimeError("A stored task must have an id.")
        return cls(
            id=task.id,
            title=task.title,
            description=task.description,
            due_at=task.due_at,
            status=task.status,
            created_at=task.created_at,
            finished_at=task.finished_at,
            is_overdue=view.is_overdue,
        )


@router.post(
    "",
    status_code=201,
    response_model=TaskResponse,
    responses=error_responses(401),
)
def create_task(
    session: CurrentSessionDep,
    body: CreateTaskBody,
    uow: UnitOfWorkDep,
    now: NowDep,
) -> TaskResponse:
    """Create a To do task, due at `due_at`, and return it."""
    view = tasks.create_task(uow, now, body.title, body.description, body.due_at)
    return TaskResponse.from_view(view)


@router.get("", response_model=list[TaskResponse], responses=error_responses(401))
def list_tasks(
    session: CurrentSessionDep, uow: UnitOfWorkDep, now: NowDep
) -> list[TaskResponse]:
    """Every task, in urgency order, as it looks now."""
    return [TaskResponse.from_view(view) for view in tasks.list_tasks(uow, now)]


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    responses=error_responses(401, 404),
)
def get_task(
    session: CurrentSessionDep, task_id: int, uow: UnitOfWorkDep, now: NowDep
) -> TaskResponse:
    """One task by its ID, as it looks now."""
    return TaskResponse.from_view(tasks.get_task(uow, now, task_id))


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    responses=error_responses(401, 404, 409),
)
def edit_task(
    session: CurrentSessionDep,
    task_id: int,
    body: EditTaskBody,
    uow: UnitOfWorkDep,
    now: NowDep,
) -> TaskResponse:
    """Change a task's title, description or due date-time and return it.

    Only the keys sent change; for an active task, an empty body returns it
    unchanged. A finished task can't be edited.
    """
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    return TaskResponse.from_view(tasks.edit_task(uow, now, task_id, **changes))


@router.delete(
    "/{task_id}",
    status_code=204,
    response_class=Response,
    responses=error_responses(401, 404, 409),
)
def delete_task(session: CurrentSessionDep, task_id: int, uow: UnitOfWorkDep) -> None:
    """Permanently delete a To do task. There is no undo."""
    tasks.delete_task(uow, task_id)
