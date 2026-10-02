"""Plain API test helpers and constants: the account, a login, a bearer header."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import Engine

from bmad_first_project.adapters.passwords import Argon2PasswordHasher
from bmad_first_project.adapters.persistence.unit_of_work import SqlUnitOfWork
from bmad_first_project.application.accounts import create_or_update_account

FIXED_NOW = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)
USERNAME = "benny"
PASSWORD = "s3cret-Pa55word"
TOKEN_URL = "/api/auth/token"

LOG_IN_BODY = {"error": {"code": "unauthenticated", "message": "Log in to continue."}}
VALIDATION_BODY = {
    "error": {
        "code": "validation_error",
        "message": "Some details aren't valid. Check them and try again.",
    }
}


def create_account(engine: Engine, password: str = PASSWORD) -> None:
    with SqlUnitOfWork(engine) as uow:
        create_or_update_account(
            uow, Argon2PasswordHasher(), FIXED_NOW, USERNAME, password
        )


def log_in(
    client: TestClient, username: str = USERNAME, password: str = PASSWORD
) -> Response:
    return client.post(TOKEN_URL, data={"username": username, "password": password})


def get_token(client: TestClient) -> str:
    response = log_in(client)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
