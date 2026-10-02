"""HTTP composition root: builds the FastAPI app and wires adapters."""

from fastapi import FastAPI

from bmad_first_project.adapters.clock import SystemClock
from bmad_first_project.adapters.http.auth import router as auth_router
from bmad_first_project.adapters.http.errors import (
    ERROR_RESPONSES,
    install_error_handlers,
    install_openapi_error_contract,
)
from bmad_first_project.adapters.http.tasks import router as tasks_router
from bmad_first_project.adapters.passwords import Argon2PasswordHasher
from bmad_first_project.adapters.persistence.engine import Engine, make_engine
from bmad_first_project.adapters.persistence.schema import assert_schema_current
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.application.ports import Clock, PasswordHasher
from bmad_first_project.settings import Settings


def create_app(
    clock: Clock | None = None,
    engine: Engine | None = None,
    hasher: PasswordHasher | None = None,
) -> FastAPI:
    """Build the FastAPI application.

    Pass `clock` to override the system clock, `engine` to override the
    database built from `Settings`, and `hasher` to override Argon2. Refuses to build when the database schema
    isn't at the Alembic head.
    """
    if engine is None:
        engine = make_engine(Settings().database_url)
    assert_schema_current(engine)

    app = FastAPI(
        title="bmad-first-project",
        responses=ERROR_RESPONSES,
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.clock = clock if clock is not None else SystemClock()
    app.state.engine = engine
    app.state.unit_of_work_factory = lambda: SqlUnitOfWork(engine)
    app.state.password_hasher = hasher if hasher is not None else Argon2PasswordHasher()
    app.include_router(auth_router)
    app.include_router(tasks_router)
    install_error_handlers(app)
    install_openapi_error_contract(app)
    return app
