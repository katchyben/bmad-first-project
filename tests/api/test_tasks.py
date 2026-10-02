"""Creating, listing, getting and editing tasks through `/api/tasks`, end to end."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.domain.task import Task, TaskStatus
from tests.api.helpers import (
    FIXED_NOW,
    LOG_IN_BODY,
    VALIDATION_BODY,
    bearer,
    get_token,
    stored_task,
)

TASKS_URL = "/api/tasks"
PLUS_TWO = timezone(timedelta(hours=2))
NOT_FOUND_BODY = {
    "error": {"code": "not_found", "message": "That task no longer exists."}
}
TOMORROW = (FIXED_NOW + timedelta(days=1)).astimezone(PLUS_TWO).isoformat()


def _task_count(engine: Engine) -> int:
    with engine.connect() as connection:
        return connection.execute(text("SELECT COUNT(*) FROM tasks")).scalar_one()


def _rule_body(message: str) -> dict[str, Any]:
    return {"error": {"code": "validation_error", "message": message}}


@pytest.fixture
def headers(client: TestClient) -> dict[str, str]:
    return bearer(get_token(client))


def test_create_returns_201_with_the_task(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine
) -> None:
    assert TOMORROW == "2026-10-02T14:30:45.123456+02:00"

    response = client.post(
        TASKS_URL, json={"title": " Pay rent ", "due_at": TOMORROW}, headers=headers
    )

    assert response.status_code == 201, response.text
    assert response.json() == {
        "id": 1,
        "title": "Pay rent",
        "description": None,
        "due_at": "2026-10-02T12:30:45.123456Z",
        "status": "to_do",
        "created_at": "2026-10-01T12:30:45.123456Z",
        "finished_at": None,
        "is_overdue": False,
    }
    assert _task_count(migrated_engine) == 1


def test_create_keeps_the_description(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine
) -> None:
    response = client.post(
        TASKS_URL,
        json={"title": "Pay rent", "description": " By card ", "due_at": TOMORROW},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["description"] == " By card "
    assert _task_count(migrated_engine) == 1


def test_due_exactly_now_is_created_and_not_overdue(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.post(
        TASKS_URL,
        json={"title": "Pay rent", "due_at": FIXED_NOW.isoformat()},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["is_overdue"] is False


@pytest.mark.parametrize(
    ("body", "message"),
    [
        pytest.param({"title": "   "}, "Enter a title.", id="blank-title"),
        pytest.param(
            {"title": "x" * 201},
            "Keep the title to 200 characters or fewer.",
            id="title-over-200",
        ),
        pytest.param(
            {"title": "Pay rent", "description": "x" * 5001},
            "Keep the description to 5,000 characters or fewer.",
            id="description-over-5000",
        ),
        pytest.param(
            {
                "title": "Pay rent",
                "due_at": (FIXED_NOW - timedelta(microseconds=1)).isoformat(),
            },
            "That time has already passed.",
            id="past",
        ),
    ],
)
def test_a_broken_rule_is_422_with_its_message_and_stores_nothing(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    body: dict[str, str],
    message: str,
) -> None:
    response = client.post(
        TASKS_URL, json={"due_at": TOMORROW, **body}, headers=headers
    )

    assert response.status_code == 422
    assert response.json() == _rule_body(message)
    assert _task_count(migrated_engine) == 0


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"title": "Pay rent"}, id="due-at-missing"),
        pytest.param(
            {"title": "Pay rent", "due_at": "2026-10-02T12:30:45"}, id="due-at-naive"
        ),
        pytest.param(
            {"title": "Pay rent", "due_at": "9999-12-31T23:59:59-01:00"},
            id="due-at-beyond-utc-range",
        ),
        pytest.param({"title": "Pay rent", "due_at": 1790000000}, id="due-at-number"),
        pytest.param({"due_at": TOMORROW}, id="title-missing"),
        pytest.param(
            {"title": "Pay rent", "due_at": TOMORROW, "status": "done"},
            id="extra-status",
        ),
        pytest.param({"title": "Pay rent", "due_at": TOMORROW, "foo": 1}, id="extra"),
    ],
)
def test_a_bad_shape_is_the_generic_422_and_stores_nothing(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    body: dict[str, Any],
) -> None:
    response = client.post(TASKS_URL, json=body, headers=headers)

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY
    assert _task_count(migrated_engine) == 0


@pytest.mark.parametrize(
    "auth",
    [
        pytest.param({}, id="missing"),
        pytest.param({"Authorization": "Bearer unknown-token"}, id="invalid"),
    ],
)
@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"title": "Pay rent", "due_at": TOMORROW}, id="good-body"),
        pytest.param({"foo": 1}, id="bad-body"),
    ],
)
def test_without_a_valid_token_it_is_401_and_stores_nothing(
    client: TestClient,
    migrated_engine: Engine,
    auth: dict[str, str],
    body: dict[str, Any],
) -> None:
    response = client.post(TASKS_URL, json=body, headers=auth)

    assert response.status_code == 401
    assert response.json() == LOG_IN_BODY
    assert response.headers["www-authenticate"] == "Bearer"
    assert _task_count(migrated_engine) == 0


def test_openapi_declares_create_task(app: FastAPI) -> None:
    schema = TestClient(app).get("/openapi.json").json()
    operation = schema["paths"][TASKS_URL]["post"]

    assert set(schema["paths"][TASKS_URL]) == {"get", "post"}
    assert operation["operationId"] == "create_task"
    assert operation["security"] == [{"OAuth2PasswordBearer": []}]
    assert operation["requestBody"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/CreateTaskBody"}
    }
    assert set(operation["responses"]) == {"201", "401", "422"}
    assert operation["responses"]["201"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/TaskResponse"}
    }
    for status in ("401", "422"):
        assert operation["responses"][status]["content"]["application/json"] == {
            "schema": {"$ref": "#/components/schemas/ErrorResponse"}
        }

    schemas = schema["components"]["schemas"]
    assert set(schemas["TaskResponse"]["properties"]) == {
        "id",
        "title",
        "description",
        "due_at",
        "status",
        "created_at",
        "finished_at",
        "is_overdue",
    }
    create = schemas["CreateTaskBody"]
    assert set(create["properties"]) == {"title", "description", "due_at"}
    assert set(create["required"]) == {"title", "due_at"}
    assert create["additionalProperties"] is False
    assert create["properties"]["due_at"] == {
        "type": "string",
        "format": "date-time",
        "title": "Due At",
    }


def _store(
    engine: Engine,
    title: str,
    due_at: datetime,
    status: TaskStatus = TaskStatus.TO_DO,
    created_at: datetime = FIXED_NOW,
) -> int:
    task = Task(
        title=title,
        description=None,
        due_at=due_at,
        status=status,
        created_at=created_at,
    )
    with SqlUnitOfWork(engine) as uow:
        stored = uow.tasks.add(task)
    assert stored.id is not None
    return stored.id


def _titles(response_json: list[dict[str, Any]]) -> list[str]:
    return [task["title"] for task in response_json]


def test_list_without_tasks_is_an_empty_array(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.get(TASKS_URL, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == []


def test_list_returns_created_tasks_as_task_responses(
    client: TestClient, headers: dict[str, str]
) -> None:
    created = client.post(
        TASKS_URL, json={"title": "Pay rent", "due_at": TOMORROW}, headers=headers
    )

    response = client.get(TASKS_URL, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == [created.json()]


def test_list_is_in_domain_order_whatever_the_insert_order(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine
) -> None:
    due = FIXED_NOW + timedelta(days=1)
    earlier = FIXED_NOW - timedelta(hours=1)
    # Inserted so that neither id nor insert order matches the expected order.
    _store(migrated_engine, "latest due", due + timedelta(hours=1))
    _store(migrated_engine, "to do, created now, first id", due)
    _store(migrated_engine, "to do, created earlier", due, created_at=earlier)
    _store(migrated_engine, "in progress", due, status=TaskStatus.IN_PROGRESS)
    _store(migrated_engine, "to do, created now, second id", due)
    _store(migrated_engine, "soonest due", due - timedelta(microseconds=1))

    first = client.get(TASKS_URL, headers=headers)
    second = client.get(TASKS_URL, headers=headers)

    assert first.status_code == 200, first.text
    assert _titles(first.json()) == [
        "soonest due",
        "in progress",
        "to do, created earlier",
        "to do, created now, first id",
        "to do, created now, second id",
        "latest due",
    ]
    assert second.json() == first.json()


def test_overdue_uses_the_request_now_in_list_and_get(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    fake_clock: Any,
) -> None:
    due = FIXED_NOW + timedelta(hours=1)
    _store(migrated_engine, "due in an hour", due)
    _store(migrated_engine, "due tomorrow", FIXED_NOW + timedelta(days=1))

    def overdue() -> dict[str, bool]:
        response = client.get(TASKS_URL, headers=headers)
        assert response.status_code == 200, response.text
        listed = response.json()
        for task in listed:
            one = client.get(f"{TASKS_URL}/{task['id']}", headers=headers)
            assert one.status_code == 200, one.text
            assert one.json()["is_overdue"] == task["is_overdue"], task["title"]
        return {task["title"]: task["is_overdue"] for task in listed}

    assert overdue() == {"due in an hour": False, "due tomorrow": False}
    fake_clock.value = due
    assert overdue() == {"due in an hour": False, "due tomorrow": False}
    fake_clock.value = due + timedelta(microseconds=1)
    assert overdue() == {"due in an hour": True, "due tomorrow": False}


def test_get_returns_the_task(client: TestClient, headers: dict[str, str]) -> None:
    created = client.post(
        TASKS_URL, json={"title": "Pay rent", "due_at": TOMORROW}, headers=headers
    ).json()

    response = client.get(f"{TASKS_URL}/{created['id']}", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == created


@pytest.mark.parametrize(
    "task_id",
    ["999", "0", "-1", str(2**63), str(-(2**63) - 1)],
)
def test_get_of_a_missing_id_is_404(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine, task_id: str
) -> None:
    _store(migrated_engine, "Pay rent", FIXED_NOW + timedelta(days=1))

    response = client.get(f"{TASKS_URL}/{task_id}", headers=headers)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND_BODY


@pytest.mark.parametrize("task_id", ["abc", "1.5"])
def test_get_of_a_non_integer_id_is_the_generic_422(
    client: TestClient, headers: dict[str, str], task_id: str
) -> None:
    response = client.get(f"{TASKS_URL}/{task_id}", headers=headers)

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY


@pytest.mark.parametrize(
    "auth",
    [
        pytest.param({}, id="missing"),
        pytest.param({"Authorization": "Bearer unknown-token"}, id="invalid"),
    ],
)
@pytest.mark.parametrize(
    "path",
    [
        pytest.param(TASKS_URL, id="list"),
        pytest.param(f"{TASKS_URL}/1", id="get-existing"),
        pytest.param(f"{TASKS_URL}/999", id="get-missing"),
        pytest.param(f"{TASKS_URL}/abc", id="get-non-integer"),
        pytest.param(f"{TASKS_URL}/{2**63}", id="get-out-of-range"),
    ],
)
def test_reading_without_a_valid_token_is_401_with_no_task_data(
    client: TestClient, migrated_engine: Engine, auth: dict[str, str], path: str
) -> None:
    _store(migrated_engine, "Secret task", FIXED_NOW + timedelta(days=1))

    response = client.get(path, headers=auth)

    assert response.status_code == 401
    assert response.json() == LOG_IN_BODY
    assert response.headers["www-authenticate"] == "Bearer"
    assert "Secret task" not in response.text


def test_openapi_declares_list_and_get_task(app: FastAPI) -> None:
    schema = TestClient(app).get("/openapi.json").json()
    envelope = {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}
    task = {"$ref": "#/components/schemas/TaskResponse"}

    listing = schema["paths"][TASKS_URL]["get"]
    assert listing["operationId"] == "list_tasks"
    assert listing["security"] == [{"OAuth2PasswordBearer": []}]
    assert "parameters" not in listing
    assert (
        listing["responses"]["200"]["content"]["application/json"]["schema"]["items"]
        == task
    )
    assert (
        listing["responses"]["200"]["content"]["application/json"]["schema"]["type"]
        == "array"
    )
    assert set(listing["responses"]) == {"200", "401", "422"}
    assert listing["responses"]["401"]["content"]["application/json"] == envelope

    path = f"{TASKS_URL}/{{task_id}}"
    assert set(schema["paths"][path]) == {"get", "patch"}
    one = schema["paths"][path]["get"]
    assert one["operationId"] == "get_task"
    assert one["security"] == [{"OAuth2PasswordBearer": []}]
    assert [p["name"] for p in one["parameters"]] == ["task_id"]
    assert one["parameters"][0]["schema"]["type"] == "integer"
    assert set(one["responses"]) == {"200", "401", "404", "422"}
    assert one["responses"]["200"]["content"]["application/json"] == {"schema": task}
    for status in ("401", "404", "422"):
        assert one["responses"][status]["content"]["application/json"] == envelope


YESTERDAY = FIXED_NOW - timedelta(days=1)


def _stored_with_description(engine: Engine, due_at: datetime) -> Task:
    task = Task(
        title="Pay rent",
        description="By card",
        due_at=due_at,
        status=TaskStatus.IN_PROGRESS,
        created_at=FIXED_NOW - timedelta(days=2),
    )
    with SqlUnitOfWork(engine) as uow:
        return uow.tasks.add(task)


@pytest.fixture
def task(migrated_engine: Engine) -> Task:
    """An In progress task due tomorrow, with a description."""
    return _stored_with_description(migrated_engine, FIXED_NOW + timedelta(days=1))


@pytest.fixture
def overdue(migrated_engine: Engine) -> Task:
    """An In progress task that was due yesterday."""
    return _stored_with_description(migrated_engine, YESTERDAY)


def _url(task: Task) -> str:
    return f"{TASKS_URL}/{task.id}"


def _wire(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _response_for(task: Task, is_overdue: bool) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "due_at": _wire(task.due_at),
        "status": task.status.value,
        "created_at": _wire(task.created_at),
        "finished_at": None,
        "is_overdue": is_overdue,
    }


def test_edit_changes_only_the_given_field_and_stores_it(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine, task: Task
) -> None:
    response = client.patch(_url(task), json={"title": " New "}, headers=headers)

    expected = replace(task, title="New")
    assert response.status_code == 200, response.text
    assert response.json() == _response_for(expected, is_overdue=False)
    assert stored_task(migrated_engine, task.id or 0) == expected


def test_edit_changes_every_field_at_once(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine, task: Task
) -> None:
    due = FIXED_NOW + timedelta(days=3)

    response = client.patch(
        _url(task),
        json={
            "title": "New",
            "description": " Cash ",
            "due_at": due.astimezone(PLUS_TWO).isoformat(),
        },
        headers=headers,
    )

    expected = replace(task, title="New", description=" Cash ", due_at=due)
    assert response.status_code == 200, response.text
    assert response.json() == _response_for(expected, is_overdue=False)
    assert stored_task(migrated_engine, task.id or 0) == expected


@pytest.mark.parametrize("description", [None, ""])
def test_edit_clears_the_description(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    task: Task,
    description: str | None,
) -> None:
    response = client.patch(
        _url(task), json={"description": description}, headers=headers
    )

    assert response.status_code == 200, response.text
    assert response.json()["description"] is None
    assert stored_task(migrated_engine, task.id or 0) == replace(task, description=None)


def test_an_empty_edit_returns_the_task_unchanged(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine, task: Task
) -> None:
    response = client.patch(_url(task), json={}, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == _response_for(task, is_overdue=False)
    assert stored_task(migrated_engine, task.id or 0) == task


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"title": None}, id="title-null"),
        pytest.param({"due_at": None}, id="due-at-null"),
        pytest.param({"title": None, "description": "Cash"}, id="title-null-mixed"),
        pytest.param({"status": "done"}, id="extra-status"),
        pytest.param({"title": "New", "foo": 1}, id="extra"),
        pytest.param({"title": 5}, id="title-number"),
        pytest.param({"due_at": "2026-10-02T12:30:45"}, id="due-at-naive"),
        pytest.param({"due_at": "9999-12-31T23:59:59-01:00"}, id="due-at-overflow"),
        pytest.param({"due_at": 1790000000}, id="due-at-number"),
    ],
)
def test_a_bad_edit_shape_is_the_generic_422_and_changes_nothing(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    task: Task,
    body: dict[str, Any],
) -> None:
    response = client.patch(_url(task), json=body, headers=headers)

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY
    assert stored_task(migrated_engine, task.id or 0) == task


@pytest.mark.parametrize(
    ("body", "message"),
    [
        pytest.param({"title": "   "}, "Enter a title.", id="blank-title"),
        pytest.param(
            {"title": "x" * 201},
            "Keep the title to 200 characters or fewer.",
            id="title-over-200",
        ),
        pytest.param(
            {"title": "New", "description": "x" * 5001},
            "Keep the description to 5,000 characters or fewer.",
            id="description-over-5000",
        ),
        pytest.param(
            {"title": "New", "due_at": (FIXED_NOW - timedelta(seconds=1)).isoformat()},
            "That time has already passed.",
            id="past",
        ),
    ],
)
def test_a_broken_rule_on_edit_is_422_with_its_message_and_changes_nothing(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    task: Task,
    body: dict[str, str],
    message: str,
) -> None:
    response = client.patch(_url(task), json=body, headers=headers)

    assert response.status_code == 422
    assert response.json() == _rule_body(message)
    assert stored_task(migrated_engine, task.id or 0) == task


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"title": "New"}, id="title-only"),
        pytest.param({"description": None}, id="description-only"),
        pytest.param(
            {"due_at": YESTERDAY.astimezone(PLUS_TWO).isoformat()},
            id="same-instant-other-offset",
        ),
    ],
)
def test_an_overdue_task_keeps_its_past_due_at_through_other_edits(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    overdue: Task,
    body: dict[str, Any],
) -> None:
    response = client.patch(_url(overdue), json=body, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json()["due_at"] == _wire(YESTERDAY)
    assert response.json()["is_overdue"] is True
    stored = stored_task(migrated_engine, overdue.id or 0)
    assert stored is not None and stored.due_at == YESTERDAY


def test_moving_an_overdue_task_to_another_past_time_is_422(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine, overdue: Task
) -> None:
    other_past = (YESTERDAY + timedelta(hours=1)).isoformat()

    response = client.patch(
        _url(overdue), json={"title": "New", "due_at": other_past}, headers=headers
    )

    assert response.status_code == 422
    assert response.json() == _rule_body("That time has already passed.")
    assert stored_task(migrated_engine, overdue.id or 0) == overdue


def test_moving_an_overdue_task_into_the_future_clears_overdue(
    client: TestClient, headers: dict[str, str], migrated_engine: Engine, overdue: Task
) -> None:
    response = client.patch(_url(overdue), json={"due_at": TOMORROW}, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json()["is_overdue"] is False
    assert response.json()["due_at"] == "2026-10-02T12:30:45.123456Z"


def test_edit_overdue_uses_the_request_now(
    client: TestClient,
    headers: dict[str, str],
    task: Task,
    fake_clock: Any,
) -> None:
    fake_clock.value = task.due_at + timedelta(microseconds=1)

    response = client.patch(_url(task), json={"title": "New"}, headers=headers)

    assert response.status_code == 200, response.text
    assert response.json()["is_overdue"] is True


@pytest.mark.parametrize("status", [TaskStatus.DONE, TaskStatus.CANCELLED])
@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"title": "New"}, id="valid-body"),
        pytest.param(
            {"title": "", "due_at": YESTERDAY.isoformat()}, id="rule-breaking-body"
        ),
        pytest.param({}, id="empty-body"),
    ],
)
def test_editing_a_finished_task_is_409_and_changes_nothing(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    status: TaskStatus,
    body: dict[str, str],
) -> None:
    finished = Task(
        title="Pay rent",
        description="By card",
        due_at=FIXED_NOW + timedelta(days=1),
        status=status,
        created_at=FIXED_NOW - timedelta(days=2),
        finished_at=FIXED_NOW - timedelta(days=1),
        previous_status=TaskStatus.IN_PROGRESS,
    )
    with SqlUnitOfWork(migrated_engine) as uow:
        finished = uow.tasks.add(finished)

    response = client.patch(_url(finished), json=body, headers=headers)

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "state_conflict",
            "message": "That task is finished and can't be changed.",
        }
    }
    assert stored_task(migrated_engine, finished.id or 0) == finished


@pytest.mark.parametrize("task_id", ["999", str(2**63)])
@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"title": "New"}, id="good-body"),
        pytest.param({"title": ""}, id="broken-rule"),
    ],
)
def test_edit_of_a_missing_id_is_404(
    client: TestClient,
    headers: dict[str, str],
    migrated_engine: Engine,
    task: Task,
    task_id: str,
    body: dict[str, str],
) -> None:
    response = client.patch(f"{TASKS_URL}/{task_id}", json=body, headers=headers)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND_BODY
    assert stored_task(migrated_engine, task.id or 0) == task


@pytest.mark.parametrize(
    "path",
    [
        pytest.param(f"{TASKS_URL}/999", id="missing-id"),
        pytest.param(f"{TASKS_URL}/abc", id="non-integer-id"),
    ],
)
def test_a_bad_shape_wins_over_a_missing_id(
    client: TestClient, headers: dict[str, str], path: str
) -> None:
    response = client.patch(path, json={"status": "done"}, headers=headers)

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY


@pytest.mark.parametrize(
    "auth",
    [
        pytest.param({}, id="missing"),
        pytest.param({"Authorization": "Bearer unknown-token"}, id="invalid"),
    ],
)
@pytest.mark.parametrize(
    ("path", "body"),
    [
        pytest.param("existing", {"title": "Changed"}, id="good-body"),
        pytest.param("existing", {"title": None, "foo": 1}, id="bad-body"),
        pytest.param(f"{TASKS_URL}/999", {"title": "Changed"}, id="missing-id"),
        pytest.param(f"{TASKS_URL}/abc", {"title": "Changed"}, id="non-integer-id"),
        pytest.param(f"{TASKS_URL}/{2**63}", {"title": ""}, id="out-of-range-id"),
    ],
)
def test_editing_without_a_valid_token_is_401_and_changes_nothing(
    client: TestClient,
    migrated_engine: Engine,
    task: Task,
    auth: dict[str, str],
    path: str,
    body: dict[str, Any],
) -> None:
    url = _url(task) if path == "existing" else path

    response = client.patch(url, json=body, headers=auth)

    assert response.status_code == 401
    assert response.json() == LOG_IN_BODY
    assert response.headers["www-authenticate"] == "Bearer"
    assert "Pay rent" not in response.text
    assert stored_task(migrated_engine, task.id or 0) == task


def test_openapi_declares_edit_task(app: FastAPI) -> None:
    schema = TestClient(app).get("/openapi.json").json()
    envelope = {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}

    operation = schema["paths"][f"{TASKS_URL}/{{task_id}}"]["patch"]
    assert operation["operationId"] == "edit_task"
    assert operation["security"] == [{"OAuth2PasswordBearer": []}]
    assert [p["name"] for p in operation["parameters"]] == ["task_id"]
    assert operation["parameters"][0]["schema"]["type"] == "integer"
    assert operation["requestBody"]["required"] is True
    assert operation["requestBody"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/EditTaskBody"}
    }
    assert set(operation["responses"]) == {"200", "401", "404", "409", "422"}
    assert operation["responses"]["200"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/TaskResponse"}
    }
    for status in ("401", "404", "409", "422"):
        assert operation["responses"][status]["content"]["application/json"] == envelope

    edit = schema["components"]["schemas"]["EditTaskBody"]
    assert "required" not in edit
    assert edit["additionalProperties"] is False
    assert edit["properties"] == {
        "title": {"type": "string", "title": "Title"},
        "description": {
            "anyOf": [{"type": "string"}, {"type": "null"}],
            "title": "Description",
        },
        "due_at": {"type": "string", "format": "date-time", "title": "Due At"},
    }
