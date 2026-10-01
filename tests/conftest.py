"""Shared fixtures: a fresh migrated database and a fake clock for every test app."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import Engine

from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.main import create_app

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXED_NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)


class FakeClock:
    """A settable `Clock` that counts how often it is read."""

    def __init__(self, value: datetime = FIXED_NOW) -> None:
        self.value = value
        self.calls = 0

    def now(self) -> datetime:
        self.calls += 1
        return self.value


def alembic_config(url: str) -> Config:
    """The project's Alembic config, pointed at `url` via `config.attributes`."""
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.attributes["url"] = url
    config.attributes["configure_logger"] = False
    return config


def upgrade_to_head(url: str) -> None:
    command.upgrade(alembic_config(url), "head")


@pytest.fixture
def alembic_ini() -> Path:
    return PROJECT_ROOT / "alembic.ini"


@pytest.fixture
def upgrade() -> Callable[[str], None]:
    """Run `alembic upgrade head` on a URL, the way `env.py` receives it in tests."""
    return upgrade_to_head


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'db' / 'test.db'}"


@pytest.fixture
def migrated_engine(database_url: str) -> Iterator[Engine]:
    upgrade_to_head(database_url)
    engine = make_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def make_app(fake_clock: FakeClock, migrated_engine: Engine) -> Callable[[], FastAPI]:
    """Build an app on this test's migrated database and fake clock."""

    def _make() -> FastAPI:
        return create_app(clock=fake_clock, engine=migrated_engine)

    return _make
