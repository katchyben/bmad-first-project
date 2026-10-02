"""The `sessions` table, its migration, `SqlSessionStore`, and FK-safe migrations."""

import shutil
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import Engine, exc, inspect, text

from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.adapters.persistence.schema import (
    SCRIPT_LOCATION,
    alembic_config,
)
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.domain.account import Account
from bmad_first_project.domain.session import UserSession

EXPIRES = datetime(2026, 10, 8, 12, 30, 45, 123456, tzinfo=UTC)


def _account_id(engine: Engine) -> int:
    with SqlUnitOfWork(engine) as uow:
        uow.accounts.add(Account(username="benny", password_hash="h"))
    with SqlUnitOfWork(engine) as uow:
        account = uow.accounts.get()
    assert account is not None and account.id is not None
    return account.id


def _session(account_id: int, token_hash: str = "a" * 64) -> UserSession:
    return UserSession(token_hash=token_hash, account_id=account_id, expires_at=EXPIRES)


def _count(engine: Engine) -> int:
    with engine.connect() as connection:
        return connection.execute(text("SELECT count(*) FROM sessions")).scalar_one()


def test_migration_creates_the_sessions_table(migrated_engine: Engine) -> None:
    inspector = inspect(migrated_engine)
    columns = {c["name"]: c for c in inspector.get_columns("sessions")}

    assert set(columns) == {"id", "token_hash", "account_id", "expires_at"}
    assert not any(columns[name]["nullable"] for name in columns)
    assert all(columns[name].get("default") is None for name in columns)
    assert inspector.get_pk_constraint("sessions")["name"] == "pk_sessions"
    assert inspector.get_unique_constraints("sessions") == [
        {"name": "uq_sessions_token_hash", "column_names": ["token_hash"]}
    ]
    [fk] = inspector.get_foreign_keys("sessions")
    assert fk["name"] == "fk_sessions_account_id_account"
    assert (fk["constrained_columns"], fk["referred_table"]) == (
        ["account_id"],
        "account",
    )
    assert fk["referred_columns"] == ["id"]
    assert fk["options"].get("ondelete") == "CASCADE"


def test_downgrade_drops_only_the_sessions_table(
    database_url: str, upgrade: Callable[[str], None]
) -> None:
    upgrade(database_url)
    config = alembic_config()
    config.attributes["url"] = database_url
    command.downgrade(config, "0002")

    engine = make_engine(database_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert "sessions" not in tables
        assert "account" in tables
    finally:
        engine.dispose()


def test_store_adds_gets_and_round_trips_expiry(migrated_engine: Engine) -> None:
    account_id = _account_id(migrated_engine)
    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.sessions.get("a" * 64) is None
        uow.sessions.add(_session(account_id))

    with SqlUnitOfWork(migrated_engine) as uow:
        stored = uow.sessions.get("a" * 64)

    assert stored is not None and stored.id is not None
    assert stored.account_id == account_id
    assert stored.expires_at == EXPIRES
    assert stored.expires_at.tzinfo is UTC


def test_delete_removes_only_that_session(migrated_engine: Engine) -> None:
    account_id = _account_id(migrated_engine)
    with SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(account_id, "a" * 64))
        uow.sessions.add(_session(account_id, "b" * 64))

    with SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.delete("a" * 64)
        uow.sessions.delete("missing")

    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.sessions.get("a" * 64) is None
        assert uow.sessions.get("b" * 64) is not None


def test_delete_all_removes_every_session(migrated_engine: Engine) -> None:
    account_id = _account_id(migrated_engine)
    with SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(account_id, "a" * 64))
        uow.sessions.add(_session(account_id, "b" * 64))

    with SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.delete_all()

    assert _count(migrated_engine) == 0


def test_store_does_not_commit(migrated_engine: Engine) -> None:
    account_id = _account_id(migrated_engine)

    class Boom(Exception):
        pass

    with pytest.raises(Boom), SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(account_id))
        raise Boom

    assert _count(migrated_engine) == 0


def test_token_hash_is_unique(migrated_engine: Engine) -> None:
    account_id = _account_id(migrated_engine)
    with SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(account_id))

    with pytest.raises(exc.IntegrityError), SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(account_id))


def test_session_needs_an_existing_account(migrated_engine: Engine) -> None:
    with pytest.raises(exc.IntegrityError), SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(999))


def test_deleting_the_account_cascades_to_sessions(migrated_engine: Engine) -> None:
    account_id = _account_id(migrated_engine)
    with SqlUnitOfWork(migrated_engine) as uow:
        uow.sessions.add(_session(account_id))

    with migrated_engine.begin() as connection:
        connection.execute(text("DELETE FROM account"))

    assert _count(migrated_engine) == 0


def test_sessions_is_unavailable_outside_the_unit_of_work(
    migrated_engine: Engine,
) -> None:
    uow = SqlUnitOfWork(migrated_engine)

    with pytest.raises(RuntimeError):
        _ = uow.sessions
    with uow:
        _ = uow.sessions
    with pytest.raises(RuntimeError):
        _ = uow.sessions


REBUILD_ACCOUNT = '''"""Test-only: rebuild the account table the way SQLite batch mode does.

Revision ID: 9999
Revises: 0003
"""

from alembic import op

revision = "9999"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("account", recreate="always"):
        pass


def downgrade() -> None:
    pass
'''


ADD_ACCOUNT_COLUMN = (
    REBUILD_ACCOUNT.replace(
        "        pass\n",
        '        batch.add_column(sa.Column("nickname", sa.String(), nullable=True))\n',
    )
    .replace(
        'with op.batch_alter_table("account", recreate="always"):',
        'with op.batch_alter_table("account", recreate="always") as batch:',
    )
    .replace(
        "from alembic import op\n", "import sqlalchemy as sa\nfrom alembic import op\n"
    )
)


def _upgrade_with_extra_revision(
    tmp_path: Path, database_url: str, source: str
) -> None:
    """Upgrade to head through a copy of the scripts plus one test-only revision."""
    scripts = tmp_path / "alembic"
    shutil.copytree(
        SCRIPT_LOCATION, scripts, ignore=shutil.ignore_patterns("__pycache__")
    )
    (scripts / "versions" / "9999_test_only.py").write_text(source)
    config = alembic_config()
    config.set_main_option("script_location", str(scripts))
    config.attributes["url"] = database_url
    command.upgrade(config, "head")


def test_batch_rebuild_of_a_parent_keeps_child_rows(
    tmp_path: Path, database_url: str, upgrade: Callable[[str], None]
) -> None:
    """With FKs on, the batch `DROP TABLE account` would cascade-delete sessions."""
    upgrade(database_url)
    engine = make_engine(database_url)
    try:
        account_id = _account_id(engine)
        with SqlUnitOfWork(engine) as uow:
            uow.sessions.add(_session(account_id))

        _upgrade_with_extra_revision(tmp_path, database_url, REBUILD_ACCOUNT)

        assert _count(engine) == 1
        with engine.connect() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
    finally:
        engine.dispose()


def _snapshot(engine: Engine) -> dict[str, object]:
    with engine.connect() as connection:

        def rows(sql: str) -> list[tuple[object, ...]]:
            return [tuple(row) for row in connection.exec_driver_sql(sql)]

        return {
            "version": rows("SELECT version_num FROM alembic_version"),
            "account_columns": [
                c["name"] for c in inspect(connection).get_columns("account")
            ],
            "account": rows("SELECT * FROM account"),
            "sessions": rows("SELECT * FROM sessions"),
        }


def test_broken_foreign_keys_fail_the_migration_and_roll_it_back(
    tmp_path: Path, database_url: str, upgrade: Callable[[str], None]
) -> None:
    upgrade(database_url)
    engine = make_engine(database_url)
    try:
        _account_id(engine)
        raw = engine.raw_connection()
        try:
            cursor = raw.cursor()
            cursor.execute("PRAGMA foreign_keys=OFF")
            cursor.execute(
                "INSERT INTO sessions (token_hash, account_id, expires_at) "
                "VALUES ('orphan', 999, '2026-10-08 00:00:00.000000')"
            )
            cursor.close()
            raw.commit()
        finally:
            raw.close()
        engine.dispose()
        before = _snapshot(engine)

        with pytest.raises(
            RuntimeError, match="The database has rows that break foreign keys: "
        ):
            _upgrade_with_extra_revision(tmp_path, database_url, ADD_ACCOUNT_COLUMN)

        engine.dispose()
        after = _snapshot(engine)
        assert after == before
        assert after["version"] == [("0003",)]
        assert "nickname" not in after["account_columns"]
    finally:
        engine.dispose()
