"""Alembic environment. The URL comes from `config.attributes["url"]`, else Settings."""

from logging.config import fileConfig

from alembic import context

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


def run_migrations_online() -> None:
    engine = make_engine(_url())
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
