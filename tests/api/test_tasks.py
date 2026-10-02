"""Creating a task through `POST /api/tasks`, end to end."""

from datetime import timedelta, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from tests.api.helpers import (
    FIXED_NOW,
    LOG_IN_BODY,
    VALIDATION_BODY,
    bearer,
    get_token,
)

TASKS_URL = "/api/tasks"
PLUS_TWO = timezone(timedelta(hours=2))
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

    assert list(schema["paths"][TASKS_URL]) == ["post"]
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
