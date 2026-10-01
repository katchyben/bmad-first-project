"""Map domain and framework errors to the HTTP error envelope.

Every failure response has the body `{"error": {"code", "message", "reason"?}}`.
`reason` appears only when set, never as `null`.

Voice convention for every `message`: short, plain, calm full sentences that end
in a full stop. No exclamation marks, no emoji, no "successfully", and no error
codes, field paths or framework detail in the text. The frontend shows the
message to the user exactly as written.
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel
from pydantic.json_schema import SkipJsonSchema
from starlette.exceptions import HTTPException as StarletteHTTPException

from bmad_first_project.domain.errors import (
    DomainError,
    DomainValidationError,
    NotFoundError,
    StateConflictError,
    UnauthenticatedError,
)

VALIDATION_MESSAGE = "Some details aren't valid. Check them and try again."
NOT_FOUND_MESSAGE = "There's nothing here."
METHOD_NOT_ALLOWED_MESSAGE = "That action isn't available here."
UNAUTHENTICATED_MESSAGE = "Log in to continue."
HTTP_ERROR_MESSAGE = "That request couldn't be completed."

_DOMAIN_ERRORS: dict[type[DomainError], tuple[int, str]] = {
    DomainValidationError: (422, "validation_error"),
    StateConflictError: (409, "state_conflict"),
    NotFoundError: (404, "not_found"),
    UnauthenticatedError: (401, "unauthenticated"),
}

_FRAMEWORK_ERRORS: dict[int, tuple[str, str]] = {
    401: ("unauthenticated", UNAUTHENTICATED_MESSAGE),
    404: ("not_found", NOT_FOUND_MESSAGE),
    405: ("method_not_allowed", METHOD_NOT_ALLOWED_MESSAGE),
}


class ErrorBody(BaseModel):
    code: str
    message: str
    # Optional but never null on the wire, so the schema omits the null branch.
    reason: str | SkipJsonSchema[None] = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# Every route documents its 422 as the envelope, not FastAPI's HTTPValidationError.
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {422: {"model": ErrorResponse}}


def _envelope(
    status_code: int,
    code: str,
    message: str,
    reason: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, message=message, reason=reason))
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(exclude_none=True),
        headers=headers,
    )


async def _handle_domain_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    status_code, code = next(
        mapping
        for error_type, mapping in _DOMAIN_ERRORS.items()
        if isinstance(exc, error_type)
    )
    reason = (exc.reason or None) if isinstance(exc, StateConflictError) else None
    headers = (
        {"WWW-Authenticate": "Bearer"}
        if isinstance(exc, UnauthenticatedError)
        else None
    )
    return _envelope(status_code, code, exc.message, reason, headers)


async def _handle_request_validation(_: Request, __: Exception) -> JSONResponse:
    return _envelope(422, "validation_error", VALIDATION_MESSAGE)


async def _handle_http_exception(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code, message = _FRAMEWORK_ERRORS.get(
        exc.status_code, ("http_error", HTTP_ERROR_MESSAGE)
    )
    return _envelope(exc.status_code, code, message, headers=exc.headers)


def install_error_handlers(app: FastAPI) -> None:
    """Register every error handler on `app`."""
    for error_type in _DOMAIN_ERRORS:
        app.add_exception_handler(error_type, _handle_domain_error)
    app.add_exception_handler(RequestValidationError, _handle_request_validation)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)


def _error_schemas() -> dict[str, Any]:
    """`ErrorResponse` and `ErrorBody` exactly as FastAPI renders them for a route.

    Rendered through FastAPI rather than `pydantic.json_schema.models_json_schema`,
    which adds `"default": null` to `reason` where FastAPI's own output does not.
    """

    def probe() -> None: ...

    route = APIRoute("/", probe, responses=ERROR_RESPONSES)
    return get_openapi(title="", version="", routes=[route])["components"]["schemas"]


def install_openapi_error_contract(app: FastAPI) -> None:
    """Always publish the error schemas, even before any route declares them."""
    build_schema = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is None:
            schema = build_schema()
            schemas = schema.setdefault("components", {}).setdefault("schemas", {})
            for name, definition in _error_schemas().items():
                schemas.setdefault(name, definition)
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = openapi
