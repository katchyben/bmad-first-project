"""Auth routes: log in with the OAuth2 password form, and log out."""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from bmad_first_project.adapters.http.dependencies import (
    CurrentSessionDep,
    NowDep,
    PasswordHasherDep,
    UnitOfWorkDep,
)
from bmad_first_project.adapters.http.errors import (
    domain_error_response,
    error_responses,
)
from bmad_first_project.application import auth
from bmad_first_project.domain.errors import UnauthenticatedError

router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


# RFC 6749 section 5.1: token responses, success or error, must not be cached.
NO_STORE_HEADERS = {"Cache-Control": "no-store", "Pragma": "no-cache"}


class _NoStoreRoute(APIRoute):
    """A route whose responses (200, 401 and the request-validation 422) are no-store.

    The form is validated before the route body runs, so the body alone cannot
    reach the 422: it is rendered here by the app's own validation handler.
    Unhandled 500s stay Starlette's plain-text response, as on every route.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def no_store_handler(request: Request) -> Response:
            try:
                response = await handler(request)
            except RequestValidationError as error:
                on_invalid = request.app.exception_handlers[RequestValidationError]
                response = await on_invalid(request, error)
            response.headers.update(NO_STORE_HEADERS)
            return response

        return no_store_handler


def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    uow: UnitOfWorkDep,
    hasher: PasswordHasherDep,
    now: NowDep,
) -> TokenResponse | JSONResponse:
    """Start a session. The token is returned here and nowhere else."""
    try:
        token = auth.login(uow, hasher, now, form.username, form.password)
    except UnauthenticatedError as error:
        # Returned, not raised: login writes nothing before refusing, so there is
        # nothing to roll back, and the response keeps its WWW-Authenticate header.
        return domain_error_response(error)
    return TokenResponse(access_token=token)


# Registered directly: the `post` decorator takes no route class.
router.add_api_route(
    "/token",
    login,
    methods=["POST"],
    response_model=TokenResponse,
    responses=error_responses(401),
    route_class_override=_NoStoreRoute,
)


@router.post(
    "/logout",
    status_code=204,
    response_class=Response,
    responses=error_responses(401),
)
def logout(session: CurrentSessionDep, uow: UnitOfWorkDep) -> None:
    """End the caller's session; its token is rejected from now on."""
    auth.logout(uow, session)
