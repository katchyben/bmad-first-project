"""The committed frontend/openapi.json matches what the backend publishes now."""

import sys
from pathlib import Path

import pytest

from bmad_first_project.cli import export_openapi, render_openapi

COMMITTED = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"


def test_committed_openapi_schema_is_current() -> None:
    assert COMMITTED.read_text(encoding="utf-8") == render_openapi(), (
        "frontend/openapi.json is stale: run `npm run generate` in frontend/ "
        "and commit openapi.json and src/client/."
    )


def test_export_is_deterministic() -> None:
    assert render_openapi() == render_openapi()


def test_export_openapi_writes_the_schema(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "openapi.json"
    monkeypatch.setattr(sys, "argv", ["export-openapi", str(target)])

    export_openapi()

    assert target.read_text(encoding="utf-8") == render_openapi()


def test_export_openapi_without_a_path_exits_2(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "argv", ["export-openapi"])

    with pytest.raises(SystemExit) as exited:
        export_openapi()

    assert exited.value.code == 2
    assert "Usage: export-openapi" in capsys.readouterr().err
