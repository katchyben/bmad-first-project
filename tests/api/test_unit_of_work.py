"""The request-scoped unit of work commits before the response, or rolls back."""

from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from bmad_first_project.adapters.http.dependencies import UnitOfWorkDep
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.domain.errors import NotFoundError


def _insert(uow: object, value: str) -> None:
    assert isinstance(uow, SqlUnitOfWork)
    uow.session.execute(text("INSERT INTO scratch (value) VALUES (:v)"), {"v": value})


def _values(engine: Engine) -> list[str]:
    with engine.connect() as conn:
        return list(conn.execute(text("SELECT value FROM scratch")).scalars())


@pytest.fixture
def app(make_app: Callable[[], FastAPI], migrated_engine: Engine) -> FastAPI:
    with migrated_engine.begin() as conn:
        conn.execute(text("CREATE TABLE scratch (value TEXT NOT NULL)"))

    app = make_app()

    @app.post("/_test/uow/ok")
    def ok(uow: UnitOfWorkDep) -> dict[str, str]:
        _insert(uow, "kept")
        return {"ok": "yes"}

    @app.post("/_test/uow/not-found")
    def not_found(uow: UnitOfWorkDep) -> None:
        _insert(uow, "dropped")
        raise NotFoundError("Gone.")

    @app.post("/_test/uow/boom")
    def boom(uow: UnitOfWorkDep) -> None:
        _insert(uow, "dropped")
        raise RuntimeError("boom")

    return app


def test_success_commits(app: FastAPI, migrated_engine: Engine) -> None:
    response = TestClient(app).post("/_test/uow/ok")

    assert response.status_code == 200
    assert _values(migrated_engine) == ["kept"]


def test_domain_error_rolls_back_and_keeps_envelope(
    app: FastAPI, migrated_engine: Engine
) -> None:
    response = TestClient(app).post("/_test/uow/not-found")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Gone."}}
    assert _values(migrated_engine) == []


def test_unexpected_error_rolls_back(app: FastAPI, migrated_engine: Engine) -> None:
    response = TestClient(app, raise_server_exceptions=False).post("/_test/uow/boom")

    assert response.status_code == 500
    assert _values(migrated_engine) == []


def test_commit_failure_is_500_not_200(
    app: FastAPI, migrated_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_commit(self: Session) -> None:
        raise RuntimeError("commit failed")

    monkeypatch.setattr(Session, "commit", failing_commit)

    response = TestClient(app, raise_server_exceptions=False).post("/_test/uow/ok")

    assert response.status_code == 500
    assert _values(migrated_engine) == []


def test_app_wires_a_fresh_unit_of_work_per_call(app: FastAPI) -> None:
    factory = app.state.unit_of_work_factory
    first, second = factory(), factory()

    assert isinstance(first, SqlUnitOfWork)
    assert first is not second
