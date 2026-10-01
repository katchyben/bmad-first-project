---
title: 'Story 1.4: Create the account from the command line'
type: 'feature'
created: '2026-10-01'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app is meant to be protected by one pre-created account, but there's no way to create it. Story 1.5's login needs an account row with a properly hashed password.

**Approach:** Add the `account` table through an Alembic migration, an Argon2 password hasher, an account repository on the unit of work, a `create_or_update_account` use case, and a `create-account` console command that prompts for the username and password and creates the single account or changes its password.

## Boundaries & Constraints

**Always:**
- The `account` table (`id`, `username` unique, `password_hash`) is created only by migration `0002`. Its password is stored only as a pwdlib Argon2 hash; the plain password is stored, logged and printed nowhere.
- At most one account ever exists. Running `create-account` again updates the existing account's password and never adds a second row.
- Decision (Benny, 2026-10-01): if an account exists and the typed username (after trimming) differs from it, refuse: print "An account already exists for 'benny'." (with the stored username) to stderr, exit 1, and write nothing. To change the password, type the existing username.
- Domain rules: the username is trimmed, then must be non-empty; the password must be non-empty (not trimmed). They're checked in the domain and raise `DomainValidationError` with calm messages.
- The command reads the username with `input` and the password twice with `getpass` (no echo); a mismatch or a domain error prints the calm message to stderr and exits 1 without writing. Success prints one calm line to stdout ("Account 'benny' created." or "Password updated for 'benny'.") and exits 0.
- It uses the app's patterns: `Settings` → `make_engine` → `assert_schema_current` (a stale schema exits 1 with that message), one `SqlUnitOfWork`, the system `Clock` read once per command, and the hasher passed in through the composition root (`cli.py`).
- `[project.scripts]` defines `create-account = "bmad_first_project.cli:create_account"`.
- From the deferred notes for this story: `env.py` imports the table modules so `SQLModel.metadata` is populated for autogenerate, and `SQLModel.metadata` gets a constraint naming convention before the first constraint exists.

**Never:** No sessions table, login, logout or session deletion (1.5). No HTTP routes. No account deletion command. No `create_all`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First run | migrated DB, no account; "benny" / "s3cret" twice | one `account` row: username `benny`, `password_hash` verifies "s3cret" with pwdlib and starts `$argon2`; "Account 'benny' created."; exit 0 | — |
| Rerun | account exists; same username, a new password | still one row; the new password verifies, the old doesn't; "Password updated for 'benny'."; exit 0 | — |
| Padded username | "  benny  " | stored as `benny` | — |
| Blank username | "   " | no write; calm message on stderr; exit 1 | `DomainValidationError` |
| Empty password | "" twice | no write; calm message; exit 1 | `DomainValidationError` |
| Mismatch | two different passwords | no write; "Those passwords don't match."; exit 1 | — |
| Different username | account `benny` exists; "alice" / a new password | no write; "An account already exists for 'benny'."; exit 1 | refused in the use case |
| Stale schema | DB not at head | no write; the schema message; exit 1 | `RuntimeError` |
| No leaks | any run | the password never appears in stdout, stderr, logs or the DB | — |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/cli.py` -- a docstring-only composition root; add `create_account()` (the entry point) delegating to a testable `run(...)` with injected prompts, streams, engine, clock and hasher.
- `src/bmad_first_project/application/ports.py` -- `Clock`, `UnitOfWork` (a context manager only). Add `PasswordHasher` (`hash`, `verify`), `AccountStore` (`get() -> Account | None`, `add`, `save`), and `accounts: AccountStore` on `UnitOfWork`.
- `src/bmad_first_project/adapters/persistence/unit_of_work.py` -- `SqlUnitOfWork` exposes `.session`; give it `.accounts` built on that session in `__enter__`.
- `src/bmad_first_project/adapters/persistence/alembic/env.py` -- `target_metadata = SQLModel.metadata` with no model imports; import the new `tables` module.
- `src/bmad_first_project/adapters/persistence/alembic/versions/0001_baseline.py` -- revision `0001`; the new migration is `0002_account.py` (sequential ids, `down_revision = "0001"`), hand-written rather than autogenerated.
- `tests/conftest.py` -- `migrated_engine`, `fake_clock`, `make_app`, `upgrade`; reuse them. `tests/architecture/test_commit_rule.py` and `test_import_boundaries.py` must keep passing: the hasher adapter lives in its own `adapters/` module, so only `cli.py`/`main.py` may import it.
- Verified: pwdlib 0.3.1 `PasswordHash((Argon2Hasher(),))` hashes to `$argon2id$v=19$…` and verifies.

## Tasks & Acceptance

**Execution:**
- [ ] `src/bmad_first_project/domain/account.py` -- `Account` plus the username and password rules -- FR1, AR2
- [ ] `src/bmad_first_project/application/ports.py`, `application/accounts.py` -- the ports and the `create_or_update_account(uow, hasher, now, username, password)` use case, returning whether it created or updated -- AR6, AR15
- [ ] `src/bmad_first_project/adapters/passwords.py` -- `Argon2PasswordHasher` (pwdlib) -- AR6, NFR5
- [ ] `src/bmad_first_project/adapters/persistence/{tables.py,accounts.py,unit_of_work.py}`, `alembic/env.py`, `alembic/versions/0002_account.py` -- `AccountRow` plus the naming convention, `SqlAccountStore`, the UoW's `.accounts`, the migration -- AR4, AR5, AR15
- [ ] `src/bmad_first_project/cli.py`, `pyproject.toml` -- the command and the entry point -- AR16
- [ ] `tests/domain/test_account.py`, `tests/application/test_create_account.py`, `tests/persistence/test_accounts.py`, `tests/cli/test_create_account.py` -- every matrix row, plus the entry point resolving through `importlib.metadata` -- NFR6

**Acceptance Criteria:**
- Given the repo, when `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest` run, then all pass, including the boundary and commit-rule tests.
- Given a scratch `DATABASE_URL` migrated to head, when `uv run create-account` runs with input, then the account is created, and a rerun updates its password.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

AR3 asks every command to read the Clock once. The account has no time columns, so the use case takes `now` for the same signature as every other use case but doesn't use it yet.

## Verification

**Commands:**
- `uv run ruff check . && uv run ruff format --check . && uv run pytest -q` -- expected: all pass
- With `DATABASE_URL=sqlite:///<scratch>/c.db`: `uv run alembic upgrade head`, then `printf 'benny\ns3cret\ns3cret\n' | uv run create-account` (`getpass` falls back to stdin when there's no TTY) -- expected: "Account 'benny' created."; never use `./data`
