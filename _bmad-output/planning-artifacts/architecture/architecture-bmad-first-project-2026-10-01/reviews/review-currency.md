---
lens: currency (web-researched vs asserted)
target: ../ARCHITECTURE-SPINE.md
reviewed: 2026-10-01
verdict: NEEDS REVISION (1 blocker, 2 major, 2 minor)
---

# Currency Review: Architecture Spine

**Verdict: needs revision.** The memlog shows real 2026-10-01 PyPI/npm lookups, and every version number in the Stack table matches the registries today. But the versions were checked one at a time, not resolved together. As written, the Python stack **cannot be installed**: SQLModel 0.0.47 caps SQLAlchemy below 2.1. Two toolchain gaps (TypeScript, Node) are deferred even though web evidence that pins them already exists, and one runtime dependency needed by AD-6 is missing from the Stack.

## Method

- PyPI JSON API (`https://pypi.org/pypi/<pkg>/json`): latest version, `requires_python`, `requires_dist` and classifiers for every Python row.
- npm registry (`https://registry.npmjs.org/<pkg>/latest`): version, `engines` and `peerDependencies` for every frontend row, plus TypeScript and @vitejs/plugin-react.
- `uv pip compile --python-version 3.13` on the Stack pins, to prove they resolve together.
- FastAPI official docs for the APIs that AD-6 and AD-12 rely on. GitHub issue tracker for openapi-ts and TS 7.
- Existing project: `pyproject.toml` (`requires-python >=3.13`, uv_build) and `.python-version` (3.13).

## Findings

### F1 [BLOCKER] SQLModel 0.0.47 + SQLAlchemy 2.1.1 cannot be installed together
- **Evidence:** SQLModel 0.0.47 declares `SQLAlchemy<2.1.0,>=2.0.14` (https://pypi.org/pypi/sqlmodel/json). SQLAlchemy 2.1.0 came out on 2026-09-24 and 2.1.1 on 2026-09-25 (https://www.sqlalchemy.org/blog/2026/09/24/sqlalchemy-2.1.0-released/). `uv pip compile` fails: *"sqlmodel>=0.0.47 depends on sqlalchemy>=2.0.14,<2.1.0 ... and you require sqlalchemy==2.1.1 ... unsatisfiable."*
- **Cause:** the memlog `(version)` entry lists each package's latest version separately. Nobody checked compatibility between them. SQLAlchemy 2.1 is one week old, and SQLModel has not yet lifted its cap.
- **Fix:** pin SQLAlchemy **2.0.54** (latest 2.0.x, 2026-09-15). The full Python set then resolves on 3.13: FastAPI 0.142.2, Pydantic 2.13.5, pydantic-settings 2.15.0, Uvicorn 0.54.0, SQLModel 0.0.47, SQLAlchemy 2.0.54, Alembic 1.20.0, pwdlib[argon2] 0.3.1, python-multipart 0.0.32, pytest 9.1.1, httpx 0.28.1. Add a Deferred row: "Move to SQLAlchemy 2.1 when SQLModel lifts the `<2.1.0` cap." AD-4 already keeps that move to one adapter.

### F2 [MAJOR] TypeScript 7.0.2 breaks @hey-api/openapi-ts 0.99.0. The spine defers a pin it could make today
- **Evidence:** open issue hey-api/hey-api#4235: with TS 7.0.2, openapi-ts 0.99.0 crashes with `Cannot read properties of undefined (reading 'AnyKeyword')`. TS 6.0.3 works (https://github.com/hey-api/hey-api/issues/4235). The openapi-ts peer range `>=5.5.3 || >=6.0.0` does **not** exclude 7.x (https://registry.npmjs.org/@hey-api/openapi-ts/latest). So `npm install typescript@latest` installs cleanly and then the generator breaks. openapi-ts 0.99.0 (2026-06-22) is older than TS 7.0.2 (2026-07-08), and the `latest` tag has not moved since.
- **Impact:** AD-11 says contract drift fails compilation, and that depends on this generator. The memlog warned about the risk ("check tool compat or pin older") but never resolved it.
- **Fix:** move TypeScript out of Deferred and into the Stack as **6.0.3**, with a note to unpin when #4235 ships a fix.

### F3 [MAJOR] Node.js floor is set by openapi-ts and Vitest, not Vite. "LTS line Vite 8.3 supports" would allow a version that fails
- **Evidence (npm `engines`):** Vite 8.3.2 `^20.19.0 || >=22.12.0`. @hey-api/openapi-ts 0.99.0 `>=22.18.0`. Vitest 5.0.3 `^22.12.0 || ^24.0.0 || >=26.0.0`. @vitejs/plugin-react 6.1.1 `^20.19.0 || >=22.12.0`. (https://registry.npmjs.org/vite/latest, https://registry.npmjs.org/@hey-api/openapi-ts/latest, https://registry.npmjs.org/vitest/latest)
- **Impact:** the Deferred row would accept Node 20.19. Vitest and openapi-ts reject Node 20, and Node 20 also reached end of life in April 2026.
- **Fix:** state the floor now: Node **>= 22.18**, choosing the current Active LTS line (24.x) at scaffold, and set `engines` in `frontend/package.json`. Confirm Active LTS status at https://nodejs.org/en/about/previous-releases when scaffolding. I did not re-fetch that page in this review.

### F4 [MINOR] python-multipart is missing from the Stack but AD-6 needs it
- **Evidence:** `OAuth2PasswordRequestForm` (AD-6) parses form data. FastAPI ships python-multipart only in its `standard`/`all` extras (https://pypi.org/pypi/fastapi/json `requires_dist`). Without it, FastAPI raises an error at startup for form routes. Latest is 0.0.32.
- **Fix:** add `python-multipart 0.0.32` to the Stack, or say explicitly that FastAPI is installed as `fastapi[standard]`.

### F5 [MINOR] Stack rows that are implied but unpinned
- `pwdlib (argon2)` should be written as the install spec `pwdlib[argon2]==0.3.1`. The extra pulls in argon2-cffi 25.1.0, which supports 3.13 and 3.14 (https://pypi.org/pypi/pwdlib/json).
- `@vitejs/plugin-react` (6.1.1, peer `vite ^8.0.0`) and `react-dom` (19.3.0) are needed for the React+Vite SPA but are not listed.
- Starlette arrives transitively at **1.7.0**. FastAPI only requires `starlette>=0.46.0`. This is fine today, but because the spine pins FastAPI exactly, the lockfile (uv.lock) should be named as the source of truth for transitive pins.

## Confirmed current (no action)

| Item | Check | Evidence |
| --- | --- | --- |
| FastAPI 0.142.2, Pydantic 2.13.5, pydantic-settings 2.15.0, Uvicorn 0.54.0, Alembic 1.20.0, pwdlib 0.3.1, pytest 9.1.1, httpx 0.28.1, Ruff 0.16.9 | Latest on PyPI on 2026-10-01; all list 3.13 support (httpx has no classifier but requires >=3.8 and resolves) | pypi.org/pypi/<pkg>/json |
| SQLModel 0.0.47 + Pydantic 2.13 | `pydantic>=2.11.0`, compatible | https://pypi.org/pypi/sqlmodel/json |
| Alembic + SQLAlchemy | `SQLAlchemy>=2.0`, works with 2.0.54 (and 2.1) | https://pypi.org/pypi/alembic/json |
| Python 3.13 | Every Python package supports 3.13; SQLAlchemy 2.1 needs >=3.11; matches `pyproject.toml` and `.python-version` | project files + PyPI |
| `OAuth2PasswordRequestForm` (AD-6) | Still the documented login form, `from fastapi.security import OAuth2PasswordRequestForm`, not deprecated (`...Strict` variant exists if `grant_type` should be enforced) | https://fastapi.tiangolo.com/tutorial/security/simple-oauth2/ |
| `RequestValidationError` re-wrap (AD-12) | `@app.exception_handler(RequestValidationError)` from `fastapi.exceptions` is current. Docs advise registering the handler on **Starlette's** `HTTPException` so router 404/405s also get the envelope; worth a line in AD-12 | https://fastapi.tiangolo.com/tutorial/handling-errors/ |
| pwdlib API (AD-6) | `PasswordHash.recommended()`, `.hash()`, `.verify()`; FastAPI docs install `pwdlib[argon2]` | https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ |
| React 19.3.0, Vite 8.3.2, @tanstack/react-query 5.104.0 (peer react ^18 \|\| ^19), Vitest 5.0.3 (peer vite ^8), @playwright/test 1.63.0 | Latest on npm; peers compatible | registry.npmjs.org |
| Starter | full-stack-fastapi-template rejected as overkill and used only as a reference; no starter defaults are inherited, so no starter-currency risk | memlog |
| Avoid passlib / python-jose | Matches FastAPI docs (pwdlib, PyJWT) | FastAPI security docs |

## Note on AD-12 (adjacent to currency)

The spine maps domain errors and `RequestValidationError`, but not framework-raised `HTTPException`s (unknown route 404, 405, and the 401 from `OAuth2PasswordBearer` when the header is missing). Without a Starlette `HTTPException` handler, these return FastAPI's `{"detail": ...}` body. That breaks "every error response is the envelope."
