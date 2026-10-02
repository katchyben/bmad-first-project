"""Task routes. Bodies are checked for shape only; the domain owns every value rule."""

from datetime import UTC, datetime
from typing import Annotated, Self

from fastapi import APIRouter
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
)

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


class CreateTaskBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    due_at: Annotated[
        AwareDatetime, BeforeValidator(_require_string), AfterValidator(_to_utc)
    ]


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
