"""SqlUnitOfWork commits on a clean exit and rolls back on an exception."""

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork


@pytest.fixture
def scratch_engine(migrated_engine: Engine) -> Engine:
    with migrated_engine.begin() as conn:
        conn.execute(text("CREATE TABLE scratch (value TEXT NOT NULL)"))
    return migrated_engine


def _values(engine: Engine) -> list[str]:
    with engine.connect() as conn:
        return list(conn.execute(text("SELECT value FROM scratch")).scalars())


def _insert(uow: SqlUnitOfWork, value: str) -> None:
    uow.session.execute(text("INSERT INTO scratch (value) VALUES (:v)"), {"v": value})


def test_clean_exit_commits_and_closes(scratch_engine: Engine) -> None:
    with SqlUnitOfWork(scratch_engine) as uow:
        session = uow.session
        _insert(uow, "kept")

    assert _values(scratch_engine) == ["kept"]
    assert not session.in_transaction()
    with pytest.raises(RuntimeError):
        _ = uow.session


def test_exception_rolls_back_reraises_and_closes(scratch_engine: Engine) -> None:
    class Boom(Exception):
        pass

    with pytest.raises(Boom), SqlUnitOfWork(scratch_engine) as uow:
        session = uow.session
        _insert(uow, "dropped")
        raise Boom

    assert _values(scratch_engine) == []
    assert not session.in_transaction()
    with pytest.raises(RuntimeError):
        _ = uow.session


def test_session_is_closed_on_exit(
    scratch_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    closed: list[Session] = []
    original_close = Session.close

    def tracking_close(self: Session) -> None:
        closed.append(self)
        original_close(self)

    monkeypatch.setattr(Session, "close", tracking_close)

    with SqlUnitOfWork(scratch_engine) as uow:
        first = uow.session
    with pytest.raises(ValueError), SqlUnitOfWork(scratch_engine) as uow:
        second = uow.session
        raise ValueError

    assert closed == [first, second]


def test_commit_failure_propagates_and_closes(
    scratch_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_commit(self: Session) -> None:
        raise RuntimeError("commit failed")

    monkeypatch.setattr(Session, "commit", failing_commit)

    with (
        pytest.raises(RuntimeError, match="commit failed"),
        SqlUnitOfWork(scratch_engine) as uow,
    ):
        session = uow.session
        _insert(uow, "lost")

    assert _values(scratch_engine) == []
    assert not session.in_transaction()
    with pytest.raises(RuntimeError):
        _ = uow.session
