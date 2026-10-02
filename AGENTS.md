<!-- bmad:context -->
<!-- Verified 2026-10-02 against 53c57b2. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## bmad-first-project

Single-user Todo app built to practise the BMad Method. FastAPI backend (Python 3.13, uv, SQLite via SQLModel + Alembic) in `src/bmad_first_project/`; React + Vite + TypeScript frontend in `frontend/`. Planning (PRD, architecture spine, UX, epics) lives in `_bmad-output/planning-artifacts/`; story specs, sprint status and the deferred-work ledger in `_bmad-output/implementation-artifacts/`.

## Policy

- One branch per story (`story/<story-key>`), one commit per spec; fast-forward `main` when the story is done. Never force-push; commit or push only when asked.
- Never hand-edit `_bmad/`, `.claude/skills/` or `.agents/skills/` (installed BMad tooling); customise through `bmad-customize`, update by reinstalling.
- Never hand-edit `frontend/src/client/` or `frontend/openapi.json`; after any API change run `npm run generate` in `frontend/` and commit both, or the drift tests fail.
- Never point tests, scripts or scratch runs at `./data/app.db` (the owner's database); set `DATABASE_URL=sqlite:///<temp dir>/x.db` instead.

## Where things are

- Composition roots: `src/bmad_first_project/main.py` (`create_app`) and `cli.py` (`create-account`, `export-openapi`) are the only modules allowed to import adapters (`tests/architecture/test_import_boundaries.py`).
- Error envelope, fixed messages and handlers: `adapters/http/errors.py`; request dependencies (`NowDep`, `UnitOfWorkDep`, `CurrentSessionDep`): `adapters/http/dependencies.py`.
- Frontend API config (token, 401 handling, retries, error messages): `frontend/src/api/`; auth state: `frontend/src/auth/useAuth.ts`.
- Before starting a story, check `_bmad-output/implementation-artifacts/deferred-work.md` and the `action_items` in `sprint-status.yaml` for items aimed at it.

## Running and verifying

- Python: `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format --check .`. Plain `pytest` is a pyenv shim on Python 3.10 and fails.
- Run `uv run alembic …` from the repo root only; `alembic.ini` lives there.
- The frontend needs Node 24; the default `node` here is v20, which breaks Vitest. Run npm from `frontend/` as `source ~/.nvm/nvm.sh && nvm use 24 && npm …`.
- Frontend checks: `npm run lint && npm run build && npm test`. `npm run e2e` starts its own backend and Vite on a temp-dir DB and fails if :8000 or :5173 is already taken; stop dev servers first.
- `npm run generate` needs `uv` (it runs `uv run --project .. export-openapi` first); no backend server is needed.
- Local run: `uv run alembic upgrade head`, `uv run create-account`, `uv run uvicorn bmad_first_project.main:create_app --factory`, then `npm run dev` in `frontend/` → http://localhost:5173.

## Conventions that differ from defaults

- Business rules live only in `domain/`. HTTP schemas check shape only (`extra="forbid"`); the frontend never validates, sorts or rewords API messages, it shows the envelope `message` as written.
- Read time only through the `Clock` port / `NowDep` (one `now` per request); `datetime.now()` and `time.time()` are banned outside `adapters/clock.py`. Datetimes are aware UTC; time columns use `UTCDateTime`.
- Only the unit of work commits: routes take `UnitOfWorkDep` (it commits before the response) and never call `.commit()` (`tests/architecture/test_commit_rule.py`).
- Schema changes are hand-written Alembic migrations with sequential ids (`0004_…`), and tables go in `adapters/persistence/tables.py`, where the constraint naming convention is set. Never `create_all`.
- The frontend calls the API only through the generated client and hooks (`fetch`, `axios` and XHR are lint-banned outside `src/client/`). No optimistic updates: invalidate and refetch.
- API messages are short, calm sentences ending in a full stop: no "!", no "successfully".

## Known pitfalls

- The IDE has twice inserted 4 leading spaces on line 1 of a Python file when it was opened (`main.py`, `cli.py`), breaking imports. Check `git diff` for line-1 indentation before trusting an unexpected change.
- Vite serves files in `frontend/` from its root, so `:5173/openapi.json` is the committed schema, not the backend. Probe backend-only paths such as `/docs` instead.

<!-- /bmad:context -->
