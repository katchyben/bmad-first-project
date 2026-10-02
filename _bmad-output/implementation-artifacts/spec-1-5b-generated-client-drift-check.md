---
title: 'Story 1.5b: Offline schema export, drift check and regenerated client'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The frontend client is generated from a running backend, so generation needs a server up, and nothing notices when the committed client falls behind the API. 1.5a added the login and logout routes, and the client doesn't have them yet; Story 1.6 needs them.

**Approach:** This is the second part of Story 1.5, split from 1.5a. Add an `export-openapi` command (in the `cli.py` composition root) that migrates a scratch database and writes `create_app().openapi()` to a committed `frontend/openapi.json`. Point `openapi-ts` at that file and make `npm run generate` run the export first. Regenerate `frontend/src/client/` under Node 24, and add a pytest that fails when the committed schema is stale and a Vitest test that fails when the committed client is stale, keeping 1.3a's `src/api` tests green.

</frozen-after-approval>

## Implementation Notes

- `cli.py` gained `render_openapi()` and the `export-openapi <path>` entry point (`[project.scripts]`). It lives in the CLI composition root because only `main.py`/`cli.py` may import adapters. The export migrates a throwaway SQLite file via the new `schema.upgrade_to_head(url)` (the package-located Alembic config, so it works from any cwd) and writes `json.dumps(…, indent=2) + "\n"`. The configured database is never touched.
- `frontend/openapi-ts.config.ts` now reads `./openapi.json`; `npm run generate` runs `uv run export-openapi openapi.json && openapi-ts`, so no backend server is needed. The regenerated client adds the `login`/`logout` SDK functions and `@tanstack/react-query.gen.ts` (`loginMutation`, `logoutMutation`).
- Drift checks: `tests/contract/test_openapi_export.py` (the committed schema equals a fresh export; the export is deterministic) and `frontend/src/client.drift.test.ts` (regenerates into a temp dir with the project config through `createClient` and compares every file). The client test needs `// @vitest-environment node`: under jsdom, openapi-ts fetches the input path as a URL and fails.
- Surprise: committing `frontend/openapi.json` means Vite's dev server serves it at `:5173/openapi.json`, which broke 1.3a's "only /api is proxied" e2e check. That check now probes the backend-only `/docs` instead (same intent; the schema is public). Failed openapi-ts runs write `openapi-ts-error-*.log` into `frontend/`; that pattern is now gitignored.
- Verified: `uv run pytest` 215 passed; frontend lint, build (type-checked), 71 unit tests, 21 e2e. Mutation: a stray line in `sdk.gen.ts` fails the client drift test; changing a route docstring fails the schema drift test.
- Review patches: `create_app` is imported inside `render_openapi()` so `create-account` doesn't load FastAPI (verified: importing `cli` leaves `fastapi` out of `sys.modules`); `export_openapi()` tests (it writes the file; exit 2 with usage without a path); the client drift walk skips dotfiles (verified with a planted `.DS_Store`); `npm run generate` uses `uv run --project ..`; the `vite.config.ts` proxy comment is updated.

## Review Triage Log

- `cli.py` imports the HTTP stack at module level — low: real, `create-account` loaded FastAPI; patched with a lazy import.
- `export_openapi()` untested — low: patched (write and usage/exit-2 tests).
- `export_openapi()` reads `sys.argv` directly; `--help` is treated as a path; no handling for unwritable paths — low: a one-argument operator command where loud failure is fine; not worth argparse.
- `upgrade_to_head()` has no direct test — low: exercised by every `render_openapi()` call (the export only succeeds if the scratch DB reaches head); it never reads `Settings` because it sets `attributes["url"]`.
- Same-process determinism test; no `sort_keys` — low: FastAPI builds the schema from route registration order (dicts, no sets or hash-seed dependence); the committed-file test runs in a fresh process each CI/test run anyway.
- The `vite.config.ts` comment is stale — low: patched.
- The smoke test no longer checks `/openapi.json` — low: its intent ("only /api is proxied") is kept via `/docs`; Vite serving the public schema file is documented in the config comment.
- Casts in the drift test; `input` overridden with a second path — low: cosmetic; the override is the same file as the config's relative `./openapi.json`.
- `.DS_Store` would fail the drift walk — low: realistic on macOS; patched (skip dotfiles).
- No CI or docs for the workflow — low: CI is deferred in the architecture; `npm run generate` documents itself in `openapi-ts.config.ts`.
- `uv` project discovery implicit — low: patched (`--project ..`).
- The generated client lost its `localhost:8000` default `baseUrl` — false: `main.tsx` always calls `configureClient()` (origin base URL) before any request, and 1.3a's tests configure the client explicitly.
- `tests/contract/` lacks `__init__.py` — false: no test folder has one; pytest runs with `--import-mode=importlib` (1.1b).
