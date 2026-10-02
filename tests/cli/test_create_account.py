"""`create-account`: prompts, messages, exit codes, and what reaches the database."""

import getpass
import importlib.metadata
import io
import logging
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import Engine, text

from bmad_first_project import cli
from bmad_first_project.adapters.persistence.engine import make_engine

VERIFIER = PasswordHash((Argon2Hasher(),))


@dataclass
class Result:
    code: int
    out: str
    err: str
    prompts: list[str]


def _prompter(answers: list[str], asked: list[str]) -> Callable[[str], str]:
    remaining: Iterator[str] = iter(answers)

    def prompt(text: str) -> str:
        asked.append(text)
        return next(remaining)

    return prompt


@pytest.fixture
def run_cli(migrated_engine: Engine, fake_clock: Any) -> Callable[..., Result]:
    def _run(
        username: str,
        password: str,
        repeated: str | None = None,
        engine: Engine | None = None,
    ) -> Result:
        out, err, asked = io.StringIO(), io.StringIO(), []
        code = cli.run(
            prompt=_prompter([username], asked),
            prompt_secret=_prompter(
                [password, password if repeated is None else repeated], asked
            ),
            stdout=out,
            stderr=err,
            engine=engine if engine is not None else migrated_engine,
            clock=fake_clock,
        )
        return Result(code, out.getvalue(), err.getvalue(), asked)

    return _run


def _rows(engine: Engine) -> list[tuple[str, str]]:
    with engine.connect() as connection:
        query = text("SELECT username, password_hash FROM account")
        return [tuple(row) for row in connection.execute(query)]


def test_first_run_creates_the_account(
    run_cli: Callable[..., Result], migrated_engine: Engine, fake_clock: Any
) -> None:
    result = run_cli("benny", "s3cret")

    assert (result.code, result.out, result.err) == (
        0,
        "Account 'benny' created.\n",
        "",
    )
    assert result.prompts == ["Username: ", "Password: ", "Repeat password: "]
    assert fake_clock.calls == 1
    [(username, password_hash)] = _rows(migrated_engine)
    assert username == "benny"
    assert password_hash.startswith("$argon2")
    assert VERIFIER.verify("s3cret", password_hash)


def test_rerun_updates_the_password(
    run_cli: Callable[..., Result], migrated_engine: Engine
) -> None:
    run_cli("benny", "s3cret")

    result = run_cli("benny", "n3w-pass")

    assert (result.code, result.out, result.err) == (
        0,
        "Password updated for 'benny'.\n",
        "",
    )
    [(username, password_hash)] = _rows(migrated_engine)
    assert username == "benny"
    assert VERIFIER.verify("n3w-pass", password_hash)
    assert not VERIFIER.verify("s3cret", password_hash)


def test_padded_username_is_stored_trimmed(
    run_cli: Callable[..., Result], migrated_engine: Engine
) -> None:
    result = run_cli("  benny  ", "s3cret")

    assert result.out == "Account 'benny' created.\n"
    assert [u for u, _ in _rows(migrated_engine)] == ["benny"]


@pytest.mark.parametrize(
    ("username", "password", "repeated", "message"),
    [
        pytest.param("   ", "s3cret", None, "Enter a username.", id="blank-username"),
        pytest.param("benny", "", None, "Enter a password.", id="empty-password"),
        pytest.param(
            "benny", "s3cret", "s3cre7", "Those passwords don't match.", id="mismatch"
        ),
    ],
)
def test_bad_input_writes_nothing_and_exits_1(
    run_cli: Callable[..., Result],
    migrated_engine: Engine,
    username: str,
    password: str,
    repeated: str | None,
    message: str,
) -> None:
    result = run_cli(username, password, repeated)

    assert (result.code, result.out, result.err) == (1, "", f"{message}\n")
    assert _rows(migrated_engine) == []


def test_different_username_is_refused(
    run_cli: Callable[..., Result], migrated_engine: Engine
) -> None:
    run_cli("benny", "s3cret")
    before = _rows(migrated_engine)

    result = run_cli("alice", "n3w-pass")

    assert (result.code, result.out, result.err) == (
        1,
        "",
        "An account already exists for 'benny'.\n",
    )
    assert _rows(migrated_engine) == before


def test_stale_schema_exits_1_before_prompting(
    run_cli: Callable[..., Result], tmp_path: Path
) -> None:
    engine = make_engine(f"sqlite:///{tmp_path / 'stale.db'}")
    try:
        result = run_cli("benny", "s3cret", engine=engine)
    finally:
        engine.dispose()

    assert result.code == 1
    assert result.out == ""
    assert "The database schema is not up to date" in result.err
    assert "uv run alembic upgrade head" in result.err
    assert result.prompts == []


def test_blank_username_stops_before_the_password_prompts(
    migrated_engine: Engine, fake_clock: Any
) -> None:
    def no_secret(_: str) -> str:
        raise AssertionError("prompt_secret must not be called")

    out, err = io.StringIO(), io.StringIO()
    code = cli.run(
        prompt=lambda _: "   ",
        prompt_secret=no_secret,
        stdout=out,
        stderr=err,
        engine=migrated_engine,
        clock=fake_clock,
    )

    assert (code, out.getvalue(), err.getvalue()) == (1, "", "Enter a username.\n")
    assert _rows(migrated_engine) == []


@pytest.mark.parametrize("error", [EOFError, KeyboardInterrupt])
@pytest.mark.parametrize("at", ["username", "password"])
def test_cancelled_prompt_writes_nothing(
    migrated_engine: Engine, fake_clock: Any, error: type[BaseException], at: str
) -> None:
    def interrupted(_: str) -> str:
        raise error

    out, err = io.StringIO(), io.StringIO()
    code = cli.run(
        prompt=interrupted if at == "username" else (lambda _: "benny"),
        prompt_secret=interrupted if at == "password" else (lambda _: "s3cret"),
        stdout=out,
        stderr=err,
        engine=migrated_engine,
        clock=fake_clock,
    )

    assert code == 1
    assert out.getvalue() == ""
    assert err.getvalue().strip() == "Cancelled. Nothing was changed."
    assert _rows(migrated_engine) == []


def test_password_never_leaks(
    run_cli: Callable[..., Result],
    database_url: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    secret = "Sup3r-Secret-Value"
    caplog.set_level(logging.DEBUG)

    results = [
        run_cli("benny", secret),
        run_cli("benny", secret + "2"),
        run_cli("benny", secret, secret + "x"),
        run_cli("alice", secret),
    ]

    for result in results:
        assert secret not in result.out + result.err
    assert all(secret not in record.getMessage() for record in caplog.records)
    db_file = Path(database_url.removeprefix("sqlite:///"))
    candidates = [db_file] + [
        db_file.with_name(f"{db_file.name}-{suffix}")
        for suffix in ("journal", "wal", "shm")
    ]
    for path in candidates:
        if path.exists():
            assert secret.encode() not in path.read_bytes(), path


class _TtyStdin(io.StringIO):
    def isatty(self) -> bool:
        return True


class _PipedStdin(io.StringIO):
    def isatty(self) -> bool:
        return False


def test_entry_point_wires_the_real_adapters(
    database_url: str,
    migrated_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    secrets = iter(["s3cret", "s3cret"])
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setattr("sys.stdin", _TtyStdin())
    monkeypatch.setattr("builtins.input", lambda _: "benny")
    monkeypatch.setattr(getpass, "getpass", lambda _: next(secrets))

    with pytest.raises(SystemExit) as caught:
        cli.create_account()

    assert caught.value.code == 0
    assert capsys.readouterr().out == "Account 'benny' created.\n"
    [(_, password_hash)] = _rows(migrated_engine)
    assert VERIFIER.verify("s3cret", password_hash)


def test_console_script_resolves_to_create_account() -> None:
    [entry_point] = importlib.metadata.entry_points(
        group="console_scripts", name="create-account"
    )

    assert entry_point.value == "bmad_first_project.cli:create_account"
    assert entry_point.load() is cli.create_account


def _session_count(engine: Engine) -> int:
    with engine.connect() as connection:
        return connection.execute(text("SELECT count(*) FROM sessions")).scalar_one()


def _add_session(engine: Engine, token_hash: str) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO sessions (token_hash, account_id, expires_at) "
                "VALUES (:h, 1, '2026-10-08 00:00:00.000000')"
            ),
            {"h": token_hash},
        )


def test_rerun_deletes_every_session(
    run_cli: Callable[..., Result], migrated_engine: Engine
) -> None:
    run_cli("benny", "s3cret")
    _add_session(migrated_engine, "a" * 64)
    _add_session(migrated_engine, "b" * 64)

    assert run_cli("benny", "n3w-pass").code == 0

    assert _session_count(migrated_engine) == 0


def test_failed_run_keeps_sessions(
    run_cli: Callable[..., Result], migrated_engine: Engine
) -> None:
    run_cli("benny", "s3cret")
    _add_session(migrated_engine, "a" * 64)

    assert run_cli("alice", "n3w-pass").code == 1
    assert run_cli("benny", "n3w-pass", "mismatch").code == 1

    assert _session_count(migrated_engine) == 1


@pytest.mark.parametrize(
    ("piped", "code", "expected_out", "expected_err"),
    [
        ("benny\ns3cret\ns3cret\n", 0, "Account 'benny' created.\n", None),
        ("benny\ns3cret\n", 1, "", "Cancelled. Nothing was changed."),
    ],
)
def test_piped_input_reads_passwords_from_stdin_without_getpass(
    database_url: str,
    migrated_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    piped: str,
    code: int,
    expected_out: str,
    expected_err: str | None,
) -> None:
    def no_getpass(_: str) -> str:
        raise AssertionError("getpass must not be used for piped input")

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setattr("sys.stdin", _PipedStdin(piped))
    monkeypatch.setattr(getpass, "getpass", no_getpass)

    with pytest.raises(SystemExit) as caught:
        cli.create_account()

    assert caught.value.code == code
    captured = capsys.readouterr()
    assert captured.out.endswith(expected_out)
    assert "s3cret" not in captured.out + captured.err
    if expected_err is not None:
        assert captured.err.strip().endswith(expected_err)
        assert _rows(migrated_engine) == []
    else:
        [(_, password_hash)] = _rows(migrated_engine)
        assert VERIFIER.verify("s3cret", password_hash)
