"""Alembic environment. The URL comes from `config.attributes["url"]`, else Settings.

Online migrations run with SQLite foreign keys off, so batch table rebuilds
(copy, drop, rename) can't cascade-delete or be blocked by child rows. The
result is checked with `PRAGMA foreign_key_check` inside the same transaction,
so a violation rolls every migration in the run back.
"""

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import event

from bmad_first_project.adapters.persistence import tables
from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.settings import Settings

config = context.config

if config.config_file_name is not None and config.attributes.get(
    "configure_logger", True
):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Importing `tables` registers every table model on the shared metadata.
target_metadata = tables.metadata


def _url() -> str:
    url = config.attributes.get("url")
    return url if url is not None else Settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _disable_foreign_keys(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=OFF")
    finally:
        cursor.close()
    # Stop pysqlite managing transactions (it never BEGINs before DDL), so the
    # explicit BEGIN below makes the whole migration one real transaction.
    dbapi_connection.isolation_level = None


def _begin(connection: Any) -> None:
    connection.exec_driver_sql("BEGIN")


def run_migrations_online() -> None:
    engine = make_engine(_url())
    is_sqlite = engine.dialect.name == "sqlite"
    if is_sqlite:
        # Runs after make_engine's listener, so it overrides foreign_keys=ON.
        event.listen(engine, "connect", _disable_foreign_keys)
        event.listen(engine, "begin", _begin)
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                # One transaction for every migration and the check below, so a
                # failure leaves the schema, data and version as they were.
                transactional_ddl=True,
            )
            with context.begin_transaction():
                context.run_migrations()
                if is_sqlite:
                    # Inside the transaction, so raising rolls the migration back.
                    violations = connection.exec_driver_sql(
                        "PRAGMA foreign_key_check"
                    ).fetchall()
                    if violations:
                        raise RuntimeError(
                            "The database has rows that break foreign keys: "
                            f"{violations!r}"
                        )
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
