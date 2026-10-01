"""Ruff must reject wall-clock reads outside the clock adapter."""

import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OFFENDER = "src/bmad_first_project/domain/offender.py"
CLOCK_ADAPTER = "src/bmad_first_project/adapters/clock.py"


def _ruff_check(
    source: str | None = None, filename: str = OFFENDER
) -> subprocess.CompletedProcess[str]:
    """Lint `source` as if it lived at `filename`, or lint `filename` from disk."""
    args = [sys.executable, "-m", "ruff", "check", "--no-cache"]
    args += ["--output-format", "concise"]
    if source is None:
        args.append(filename)
    else:
        args += ["--stdin-filename", filename, "-"]
    return subprocess.run(
        args,
        input=source,
        capture_output=True,
        text=True,
        check=False,
        cwd=PROJECT_ROOT,
    )


@pytest.mark.parametrize(
    ("source", "expected_code"),
    [
        ("from datetime import datetime\n\nx = datetime.now()\n", "DTZ005"),
        ("from datetime import UTC, datetime\n\nx = datetime.now(UTC)\n", "TID251"),
        ("import datetime as dt\n\nx = dt.datetime.now(dt.UTC)\n", "TID251"),
        ("from datetime import datetime\n\nx = datetime.utcnow()\n", "DTZ003"),
        ("from datetime import datetime\n\nx = datetime.today()\n", "DTZ002"),
        ("from datetime import date\n\nx = date.today()\n", "DTZ011"),
        ("import time\n\nx = time.time()\n", "TID251"),
        ("import time\n\nx = time.time_ns()\n", "TID251"),
        ("import time\n\nx = time.localtime()\n", "TID251"),
        ("import time\n\nx = time.gmtime()\n", "TID251"),
        ("import time\n\nx = time.ctime()\n", "TID251"),
    ],
)
def test_banned_clock_call_fails_lint(source: str, expected_code: str) -> None:
    result = _ruff_check(source)

    assert result.returncode != 0, result.stdout + result.stderr
    assert expected_code in result.stdout, result.stdout + result.stderr


def test_clock_adapter_is_exempt() -> None:
    result = _ruff_check(filename=CLOCK_ADAPTER)
    assert result.returncode == 0, result.stdout + result.stderr


def test_naive_now_still_fails_in_clock_adapter() -> None:
    source = "from datetime import datetime\n\nx = datetime.now()\n"
    result = _ruff_check(source, filename=CLOCK_ADAPTER)

    assert result.returncode != 0, result.stdout + result.stderr
    assert "DTZ005" in result.stdout, result.stdout + result.stderr
