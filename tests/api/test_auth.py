"""Login, logout and the shared bearer-token auth dependency, end to end."""

import hashlib
import logging
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Engine, text

from bmad_first_project.adapters.http.dependencies import (
    CurrentSessionDep,
    UnitOfWorkDep,
)
from bmad_first_project.adapters.passwords import Argon2PasswordHasher
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.application.accounts import create_or_update_account

FIXED_NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)
USERNAME = "benny"
PASSWORD = "s3cret-Pa55word"
TOKEN_URL = "/api/auth/token"
LOGOUT_URL = "/api/auth/logout"
PROTECTED_URL = "/_test/protected"

BAD_CREDENTIALS_BODY = {
    "error": {
        "code": "unauthenticated",
        "message": "That username and password don't match.",
    }
}
LOG_IN_BODY = {"error": {"code": "unauthenticated", "message": "Log in to continue."}}
VALIDATION_BODY = {
    "error": {
        "code": "validation_error",
        "message": "Some details aren't valid. Check them and try again.",
    }
}


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str


def _create_account(engine: Engine, password: str = PASSWORD) -> None:
    with SqlUnitOfWork(engine) as uow:
        create_or_update_account(
            uow, Argon2PasswordHasher(), FIXED_NOW, USERNAME, password
        )


@pytest.fixture
def app(
    make_app: Callable[[], FastAPI], migrated_engine: Engine, fake_clock: Any
) -> FastAPI:
    fake_clock.value = FIXED_NOW
    _create_account(migrated_engine)
    app = make_app()

    @app.get(PROTECTED_URL)
    def protected(session: CurrentSessionDep) -> dict[str, int]:
        return {"account_id": session.account_id}

    @app.post("/_test/protected-body")
    def protected_body(session: CurrentSessionDep, payload: StrictBody) -> None:
        pass

    @app.get("/_test/protected-uow")
    def protected_uow(session: CurrentSessionDep, uow: UnitOfWorkDep) -> None:
        pass

    return app


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


def _login(
    client: TestClient, username: str = USERNAME, password: str = PASSWORD
) -> Response:
    return client.post(TOKEN_URL, data={"username": username, "password": password})


def _token(client: TestClient) -> str:
    response = _login(client)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _session_rows(engine: Engine) -> list[tuple[str, int, str]]:
    with engine.connect() as connection:
        query = text("SELECT token_hash, account_id, expires_at FROM sessions")
        return [tuple(row) for row in connection.execute(query)]


NO_STORE = {"cache-control": "no-store", "pragma": "no-cache"}


def _assert_no_store(response: Response) -> None:
    assert {k: response.headers.get(k) for k in NO_STORE} == NO_STORE


def _assert_log_in(response: Response) -> None:
    assert response.status_code == 401
    assert response.json() == LOG_IN_BODY
    assert response.headers["www-authenticate"] == "Bearer"


def test_login_returns_a_bearer_token_and_stores_only_its_hash(
    client: TestClient, migrated_engine: Engine
) -> None:
    response = _login(client)

    assert response.status_code == 200
    _assert_no_store(response)
    body = response.json()
    assert set(body) == {"access_token", "token_type"}
    assert body["token_type"] == "bearer"
    token = body["access_token"]
    assert len(token) >= 43

    [(token_hash, account_id, expires_at)] = _session_rows(migrated_engine)
    assert token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert account_id == 1
    expected = (FIXED_NOW + timedelta(days=7)).replace(tzinfo=None)
    assert expires_at == expected.isoformat(sep=" ")


def test_login_trims_the_username(client: TestClient) -> None:
    assert _login(client, username=f"  {USERNAME} ").status_code == 200


@pytest.mark.parametrize(
    ("username", "password"),
    [
        pytest.param(USERNAME, "nope", id="wrong-password"),
        pytest.param("alice", PASSWORD, id="unknown-username"),
        pytest.param(USERNAME.upper(), PASSWORD, id="username-case"),
    ],
)
def test_bad_credentials_are_401_with_the_exact_message(
    client: TestClient, migrated_engine: Engine, username: str, password: str
) -> None:
    response = _login(client, username, password)

    assert response.status_code == 401
    assert response.json() == BAD_CREDENTIALS_BODY
    assert response.headers["www-authenticate"] == "Bearer"
    _assert_no_store(response)
    assert _session_rows(migrated_engine) == []


def test_wrong_password_and_unknown_user_look_identical(client: TestClient) -> None:
    wrong_password = _login(client, USERNAME, "nope")
    unknown_user = _login(client, "alice", PASSWORD)

    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.content == unknown_user.content
    assert dict(wrong_password.headers) == dict(unknown_user.headers)


@pytest.mark.parametrize(
    "data",
    [
        pytest.param({"username": "", "password": PASSWORD}, id="empty-username"),
        pytest.param({"username": USERNAME, "password": ""}, id="empty-password"),
        pytest.param({"username": USERNAME}, id="missing-password"),
        pytest.param({}, id="no-fields"),
    ],
)
def test_empty_or_missing_form_fields_are_a_shape_error(
    client: TestClient, migrated_engine: Engine, data: dict[str, str]
) -> None:
    response = client.post(TOKEN_URL, data=data)

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY
    _assert_no_store(response)
    assert _session_rows(migrated_engine) == []


def test_token_works_until_the_last_microsecond(
    client: TestClient, fake_clock: Any
) -> None:
    token = _token(client)
    fake_clock.value = FIXED_NOW + timedelta(days=7) - timedelta(microseconds=1)

    response = client.get(PROTECTED_URL, headers=_bearer(token))

    assert response.status_code == 200
    assert response.json() == {"account_id": 1}


@pytest.mark.parametrize(
    "later",
    [timedelta(days=7), timedelta(days=7, microseconds=1), timedelta(days=365)],
)
def test_token_expires_seven_days_after_login(
    client: TestClient, fake_clock: Any, later: timedelta
) -> None:
    token = _token(client)
    fake_clock.value = FIXED_NOW + timedelta(days=6)
    assert client.get(PROTECTED_URL, headers=_bearer(token)).status_code == 200

    fake_clock.value = FIXED_NOW + later

    _assert_log_in(client.get(PROTECTED_URL, headers=_bearer(token)))


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="missing"),
        pytest.param({"Authorization": "Basic x"}, id="basic"),
        pytest.param({"Authorization": "Bearer"}, id="bearer-no-token"),
        pytest.param({"Authorization": "Bearer "}, id="bearer-blank"),
        pytest.param({"Authorization": "x"}, id="garbage"),
        pytest.param({"Authorization": "Bearer unknown-token"}, id="unknown"),
    ],
)
def test_bad_token_is_the_401_envelope(
    client: TestClient, headers: dict[str, str]
) -> None:
    _assert_log_in(client.get(PROTECTED_URL, headers=headers))


def test_unauthenticated_beats_shape_validation(client: TestClient) -> None:
    response = client.post("/_test/protected-body", json={"extra": 1})

    _assert_log_in(response)


def test_authenticated_request_still_gets_shape_validation(
    client: TestClient,
) -> None:
    response = client.post(
        "/_test/protected-body", json={"extra": 1}, headers=_bearer(_token(client))
    )

    assert response.status_code == 422
    assert response.json() == VALIDATION_BODY


def test_auth_shares_the_request_unit_of_work_and_now(
    app: FastAPI, client: TestClient, fake_clock: Any
) -> None:
    token = _token(client)
    factory = app.state.unit_of_work_factory
    opened: list[object] = []

    def counting_factory() -> object:
        uow = factory()
        opened.append(uow)
        return uow

    app.state.unit_of_work_factory = counting_factory
    calls_before = fake_clock.calls

    response = client.get("/_test/protected-uow", headers=_bearer(token))

    assert response.status_code == 200
    assert len(opened) == 1
    assert fake_clock.calls - calls_before == 1


def test_logout_ends_the_session(client: TestClient, migrated_engine: Engine) -> None:
    token = _token(client)
    other = _token(client)

    response = client.post(LOGOUT_URL, headers=_bearer(token))

    assert response.status_code == 204
    assert response.content == b""
    remaining = [row[0] for row in _session_rows(migrated_engine)]
    assert remaining == [hashlib.sha256(other.encode()).hexdigest()]
    _assert_log_in(client.get(PROTECTED_URL, headers=_bearer(token)))
    _assert_log_in(client.post(LOGOUT_URL, headers=_bearer(token)))
    assert client.get(PROTECTED_URL, headers=_bearer(other)).status_code == 200


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer unknown-token"}],
    ids=["missing", "unknown"],
)
def test_logout_requires_auth(
    client: TestClient, migrated_engine: Engine, headers: dict[str, str]
) -> None:
    _token(client)

    _assert_log_in(client.post(LOGOUT_URL, headers=headers))
    assert len(_session_rows(migrated_engine)) == 1


def test_create_account_rerun_ends_every_session(
    client: TestClient, migrated_engine: Engine
) -> None:
    tokens = [_token(client), _token(client)]

    _create_account(migrated_engine, "n3w-Pa55word")

    assert _session_rows(migrated_engine) == []
    for token in tokens:
        _assert_log_in(client.get(PROTECTED_URL, headers=_bearer(token)))


def _texts(response: Response) -> str:
    return response.text + "".join(f"{k}: {v}" for k, v in response.headers.items())


def test_secrets_never_leak(
    client: TestClient,
    fake_clock: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)

    login = _login(client)
    token = login.json()["access_token"]
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    others = [
        _login(client, USERNAME, "nope"),
        _login(client, "alice", PASSWORD),
        client.get(PROTECTED_URL, headers=_bearer(token)),
        client.post("/_test/protected-body", json={}, headers=_bearer(token)),
        client.post(LOGOUT_URL, headers=_bearer(token)),
        client.get(PROTECTED_URL, headers=_bearer(token)),
        client.post(LOGOUT_URL, headers=_bearer(token)),
    ]
    fake_clock.value = FIXED_NOW + timedelta(days=8)
    others.append(client.get(PROTECTED_URL, headers=_bearer(token)))

    assert token_hash not in _texts(login)
    assert PASSWORD not in _texts(login)
    for response in others:
        for secret in (token, token_hash, PASSWORD):
            assert secret not in _texts(response)
    logged = "\n".join(
        f"{record.getMessage()} {record.args!r}" for record in caplog.records
    )
    for secret in (token, token_hash, PASSWORD):
        assert secret not in logged


def test_app_wires_the_argon2_hasher(app: FastAPI) -> None:
    assert isinstance(app.state.password_hasher, Argon2PasswordHasher)
