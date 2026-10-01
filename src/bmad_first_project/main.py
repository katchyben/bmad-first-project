"""HTTP composition root: builds the FastAPI app and wires adapters."""

from fastapi import FastAPI

from bmad_first_project.adapters.clock import SystemClock
from bmad_first_project.adapters.http.errors import install_error_handlers
from bmad_first_project.application.ports import Clock


def create_app(clock: Clock | None = None) -> FastAPI:
    """Build the FastAPI application. Pass `clock` to override the system clock."""
    app = FastAPI(title="bmad-first-project")
    app.state.clock = clock if clock is not None else SystemClock()
    install_error_handlers(app)
    return app
