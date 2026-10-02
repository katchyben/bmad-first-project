"""The `account` table, its migration and `SqlAccountStore`."""

from collections.abc import Callable
from dataclasses import replace

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine, exc, inspect, text

from bmad_first_project.adapters.persistence import tables
from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.adapters.persistence.schema import alembic_config
from bmad_first_project.adapters.persistence.tables import AccountRow, metadata
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.domain.account import Account


def test_migration_creates_the_account_table(migrated_engine: Engine) -> None:
    inspector = inspect(migrated_engine)
    columns = {c["name"]: c for c in inspector.get_columns("account")}

    assert set(columns) == {"id", "username", "password_hash"}
    assert not columns["username"]["nullable"]
    assert not columns["password_hash"]["nullable"]
    assert inspector.get_pk_constraint("account")["name"] == "pk_account"
    assert inspector.get_unique_constraints("account") == [
        {"name": "uq_account_username", "column_names": ["username"]}
    ]


def test_downgrade_drops_the_account_table(
    database_url: str, upgrade: Callable[[str], None]
) -> None:
    upgrade(database_url)
    config = alembic_config()
    config.attributes["url"] = database_url
    command.downgrade(config, "0001")

    engine = make_engine(database_url)
    try:
        assert "account" not in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_metadata_has_the_table_and_a_naming_convention() -> None:
    assert metadata.tables["account"] is AccountRow.__table__
    assert metadata.naming_convention["uq"] == "uq_%(table_name)s_%(column_0_name)s"


def test_store_adds_gets_and_saves(migrated_engine: Engine) -> None:
    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.accounts.get() is None
        uow.accounts.add(Account(username="benny", password_hash="h1"))

    with SqlUnitOfWork(migrated_engine) as uow:
        stored = uow.accounts.get()
        assert stored is not None
        assert stored.id is not None
        assert (stored.username, stored.password_hash) == ("benny", "h1")
        uow.accounts.save(replace(stored, password_hash="h2"))

    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.accounts.get() == replace(stored, password_hash="h2")


def test_store_does_not_commit(migrated_engine: Engine) -> None:
    class Boom(Exception):
        pass

    with pytest.raises(Boom), SqlUnitOfWork(migrated_engine) as uow:
        uow.accounts.add(Account(username="benny", password_hash="h1"))
        raise Boom

    with SqlUnitOfWork(migrated_engine) as uow:
        assert uow.accounts.get() is None


def test_save_needs_an_existing_account(migrated_engine: Engine) -> None:
    with pytest.raises(LookupError), SqlUnitOfWork(migrated_engine) as uow:
        uow.accounts.save(Account(username="benny", password_hash="h"))


def test_username_is_unique_in_the_database(migrated_engine: Engine) -> None:
    insert = text("INSERT INTO account (username, password_hash) VALUES ('benny', 'h')")
    with migrated_engine.begin() as connection:
        connection.execute(insert)

    with pytest.raises(exc.IntegrityError), migrated_engine.begin() as connection:
        connection.execute(insert)


def test_accounts_is_unavailable_outside_the_unit_of_work(
    migrated_engine: Engine,
) -> None:
    uow = SqlUnitOfWork(migrated_engine)

    with pytest.raises(RuntimeError):
        _ = uow.accounts
    with uow:
        _ = uow.accounts
    with pytest.raises(RuntimeError):
        _ = uow.accounts


def test_models_match_migrations(migrated_engine: Engine) -> None:
    with migrated_engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), tables.metadata)

    assert diff == []
    assert {"account", "sessions"} <= set(tables.metadata.tables)
