"""Every failure response is the error envelope in the calm UX voice."""

from collections.abc import Callable
from datetime import datetime

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict

from bmad_first_project.adapters.http.errors import _DOMAIN_ERRORS
from bmad_first_project.domain.errors import (
    DomainError,
    DomainValidationError,
    NotFoundError,
    StateConflictError,
    UnauthenticatedError,
)

VALIDATION_BODY = {
    "error": {
        "code": "validation_error",
        "message": "Some details aren't valid. Check them and try again.",
    }
}


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str


def _app(make_app: Callable[[], FastAPI]) -> FastAPI:
    app = make_app()

    @app.get("/_test/get-only")
    def get_only() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/_test/query")
    def query(q: str, when: datetime) -> dict[str, str]:
        return {"q": q}

    @app.post("/_test/body")
    def body(payload: StrictBody) -> dict[str, str]:
        return {"title": payload.title}

    @app.get("/_test/raise/validation")
    def raise_validation() -> None:
        raise DomainValidationError("That title is too long.")

    @app.get("/_test/raise/conflict")
    def raise_conflict() -> None:
        raise StateConflictError("That task is already finished.")

    @app.get("/_test/raise/conflict-reason")
    def raise_conflict_reason() -> None:
        raise StateConflictError("That task is already finished.", "already_finished")

    @app.get("/_test/raise/conflict-empty-reason")
    def raise_conflict_empty_reason() -> None:
        raise StateConflictError("That task is already finished.", reason="")

    @app.get("/_test/raise/not-found")
    def raise_not_found() -> None:
        raise NotFoundError("That task doesn't exist.")

    @app.get("/_test/raise/unauthenticated")
    def raise_unauthenticated() -> None:
        raise UnauthenticatedError("That username and password don't match.")

    @app.get("/_test/raise/http-401")
    def raise_http_401() -> None:
        raise HTTPException(
            401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"}
        )

    @app.get("/_test/raise/http-400")
    def raise_http_400() -> None:
        raise HTTPException(400, detail="Bad thing happened")

    return app


@pytest.fixture
def client(make_app: Callable[[], FastAPI]) -> TestClient:
    return TestClient(_app(make_app))


def test_unknown_route_is_not_found_envelope(client: TestClient) -> None:
    response = client.get("/api/nope")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "There's nothing here."}
    }


def test_wrong_method_is_method_not_allowed_and_keeps_allow(client: TestClient) -> None:
    response = client.delete("/_test/get-only")

    assert response.status_code == 405
    assert response.json() == {
        "error": {
            "code": "method_not_allowed",
            "message": "That action isn't available here.",
        }
    }
    assert response.headers["allow"] == "GET"


@pytest.mark.parametrize(
    ("method", "url", "kwargs"),
    [
        pytest.param(
            "GET", "/_test/query?when=2026-10-01T12:00:00Z", {}, id="missing-query"
        ),
        pytest.param("GET", "/_test/query?q=x&when=not-a-date", {}, id="bad-datetime"),
        pytest.param(
            "POST",
            "/_test/body",
            {"json": {"title": "a", "extra": 1}},
            id="extra-field",
        ),
    ],
)
def test_request_validation_is_fixed_validation_envelope(
    client: TestClient, method: str, url: str, kwargs: dict[str, object]
) -> None:
    response = client.request(method, url, **kwargs)

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY


@pytest.mark.parametrize(
    ("path", "status", "code", "message"),
    [
        ("/_test/raise/validation", 422, "validation_error", "That title is too long."),
        (
            "/_test/raise/conflict",
            409,
            "state_conflict",
            "That task is already finished.",
        ),
        ("/_test/raise/not-found", 404, "not_found", "That task doesn't exist."),
        (
            "/_test/raise/unauthenticated",
            401,
            "unauthenticated",
            "That username and password don't match.",
        ),
    ],
)
def test_domain_errors_map_to_envelope_with_their_message(
    client: TestClient, path: str, status: int, code: str, message: str
) -> None:
    response = client.get(path)

    assert response.status_code == status
    assert response.json() == {"error": {"code": code, "message": message}}
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"
    else:
        assert "www-authenticate" not in response.headers


def test_state_conflict_includes_reason_when_given(client: TestClient) -> None:
    response = client.get("/_test/raise/conflict-reason")

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "state_conflict",
            "message": "That task is already finished.",
            "reason": "already_finished",
        }
    }


def test_state_conflict_omits_empty_reason(client: TestClient) -> None:
    response = client.get("/_test/raise/conflict-empty-reason")

    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "state_conflict", "message": "That task is already finished."}
    }


def _subclasses(cls: type) -> set[type]:
    direct = set(cls.__subclasses__())
    return direct.union(*(_subclasses(sub) for sub in direct))


def test_every_domain_error_subclass_is_mapped() -> None:
    unmapped = {
        sub
        for sub in _subclasses(DomainError)
        if not any(issubclass(sub, mapped) for mapped in _DOMAIN_ERRORS)
    }

    assert unmapped == set()


def test_framework_401_is_unauthenticated_and_keeps_header(client: TestClient) -> None:
    response = client.get("/_test/raise/http-401")

    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthenticated", "message": "Log in to continue."}
    }
    assert response.headers["www-authenticate"] == "Bearer"


def test_other_framework_error_keeps_status_with_generic_envelope(
    client: TestClient,
) -> None:
    response = client.get("/_test/raise/http-400")

    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "http_error",
            "message": "That request couldn't be completed.",
        }
    }


def test_bare_domain_error_is_not_mapped(make_app: Callable[[], FastAPI]) -> None:
    app = _app(make_app)

    @app.get("/_test/raise/bare")
    def raise_bare() -> None:
        raise DomainError("Unmapped.")

    with pytest.raises(DomainError):
        TestClient(app).get("/_test/raise/bare")
