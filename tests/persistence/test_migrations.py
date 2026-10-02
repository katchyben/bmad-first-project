"""Alembic owns the schema, and the app refuses to start on a stale one."""

import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, text

from bmad_first_project.adapters.persistence.engine import make_engine
from bmad_first_project.adapters.persistence.schema import (
    alembic_config,
    assert_schema_current,
)
from bmad_first_project.main import create_app

Upgrade = Callable[[str], None]


def _head() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head() or ""


def test_upgrade_creates_missing_directory_and_reaches_head(
    tmp_path: Path, upgrade: Upgrade
) -> None:
    db_file = tmp_path / "missing" / "nested" / "app.db"
    url = f"sqlite:///{db_file}"

    upgrade(url)

    assert db_file.exists()
    engine = make_engine(url)
    with engine.connect() as connection:
        version = connection.execute(text("SELECT version_num FROM alembic_version"))
        assert version.scalar_one() == _head()
    assert set(inspect(engine).get_table_names()) == {
        "alembic_version",
        "account",
        "sessions",
        "tasks",
    }
    assert_schema_current(engine)


def test_env_falls_back_to_settings_url(
    tmp_path: Path, alembic_ini: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from alembic import command

    db_file = tmp_path / "from-settings" / "app.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    config = Config(str(alembic_ini))
    config.attributes["configure_logger"] = False

    command.upgrade(config, "head")

    assert_schema_current(make_engine(f"sqlite:///{db_file}"))


def test_package_config_matches_alembic_ini(alembic_ini: Path) -> None:
    from_ini = ScriptDirectory.from_config(Config(str(alembic_ini)))
    from_package = ScriptDirectory.from_config(alembic_config())

    assert Path(from_ini.dir).resolve() == Path(from_package.dir).resolve()
    assert from_ini.get_heads() == from_package.get_heads()


def test_stale_schema_refuses_to_build_the_app(tmp_path: Path) -> None:
    engine = make_engine(f"sqlite:///{tmp_path / 'stale.db'}")

    with pytest.raises(RuntimeError) as caught:
        create_app(engine=engine)

    message = str(caught.value)
    assert "current revision: none" in message
    assert f"head revision: {_head()}" in message
    assert "uv run alembic upgrade head" in message


def test_unknown_revision_is_stale(migrated_engine: Engine) -> None:
    with migrated_engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num = 'zzzz'"))

    with pytest.raises(RuntimeError, match="current revision: zzzz"):
        create_app(engine=migrated_engine)


def test_default_engine_comes_from_settings(
    tmp_path: Path, upgrade: Upgrade, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'default' / 'app.db'}"
    upgrade(url)
    monkeypatch.setenv("DATABASE_URL", url)

    app = create_app()

    assert str(app.state.engine.url) == url
    assert TestClient(app).get("/openapi.json").status_code == 200


def test_settings_default_url() -> None:
    from bmad_first_project.settings import Settings

    assert Settings.model_fields["database_url"].default == "sqlite:///./data/app.db"


def test_fixture_app_uses_its_own_migrated_engine(
    make_app: object, migrated_engine: Engine, database_url: str, tmp_path: Path
) -> None:
    app = make_app()  # type: ignore[operator]

    assert app.state.engine is migrated_engine
    assert str(migrated_engine.url) == database_url
    assert database_url.startswith(f"sqlite:///{tmp_path}")
    assert_schema_current(migrated_engine)


def test_get_engine_reads_app_state(make_app: object) -> None:
    from typing import Annotated, Any

    from fastapi import Depends

    from bmad_first_project.adapters.http.dependencies import get_engine

    app = make_app()  # type: ignore[operator]

    @app.get("/_test/engine")
    def probe(engine: Annotated[Any, Depends(get_engine)]) -> dict[str, bool]:
        return {"same": engine is app.state.engine}

    assert TestClient(app).get("/_test/engine").json() == {"same": True}


def test_alembic_cli_upgrades_with_ini_logging(
    tmp_path: Path, alembic_ini: Path
) -> None:
    url = f"sqlite:///{tmp_path / 'cli' / 'app.db'}"

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=alembic_ini.parent,
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    engine = make_engine(url)
    try:
        assert_schema_current(engine)
    finally:
        engine.dispose()
