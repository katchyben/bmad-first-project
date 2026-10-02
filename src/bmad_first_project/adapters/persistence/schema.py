"""Startup guard: refuse to run against a database that isn't at the Alembic head."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine

SCRIPT_LOCATION = Path(__file__).resolve().parent / "alembic"
UPGRADE_COMMAND = "uv run alembic upgrade head"


def alembic_config() -> Config:
    """An Alembic `Config` located from the package, so it works from any cwd."""
    config = Config()
    config.set_main_option("script_location", str(SCRIPT_LOCATION))
    config.set_main_option("path_separator", "os")
    return config


def upgrade_to_head(url: str) -> None:
    """Migrate the database at `url` to the Alembic head (used for scratch DBs)."""
    config = alembic_config()
    config.attributes["url"] = url
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


def assert_schema_current(engine: Engine) -> None:
    """Raise `RuntimeError` unless the database is exactly at the Alembic head."""
    heads = set(ScriptDirectory.from_config(alembic_config()).get_heads())
    with engine.connect() as connection:
        current = set(MigrationContext.configure(connection).get_current_heads())
    if current != heads:
        raise RuntimeError(
            "The database schema is not up to date "
            f"(current revision: {', '.join(sorted(current)) or 'none'}; "
            f"head revision: {', '.join(sorted(heads))}). "
            f"Run `{UPGRADE_COMMAND}` and start the app again."
        )
