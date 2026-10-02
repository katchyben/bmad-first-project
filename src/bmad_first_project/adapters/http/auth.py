"""Auth routes: log in with the OAuth2 password form, and log out."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
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


@router.post("/token", response_model=TokenResponse, responses=error_responses(401))
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    uow: UnitOfWorkDep,
    hasher: PasswordHasherDep,
    now: NowDep,
    response: Response,
) -> TokenResponse | JSONResponse:
    """Start a session. The token is returned here and nowhere else."""
    try:
        token = auth.login(uow, hasher, now, form.username, form.password)
    except UnauthenticatedError as error:
        # Returned, not raised, so the 401 carries the no-store headers too.
        # Login writes nothing before refusing, so there is nothing to roll back.
        return domain_error_response(error, NO_STORE_HEADERS)
    response.headers.update(NO_STORE_HEADERS)
    return TokenResponse(access_token=token)


@router.post(
    "/logout",
    status_code=204,
    response_class=Response,
    responses=error_responses(401),
)
def logout(session: CurrentSessionDep, uow: UnitOfWorkDep) -> None:
    """End the caller's session; its token is rejected from now on."""
    auth.logout(uow, session)
