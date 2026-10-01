"""The single account that protects the app, and its username and password rules."""

from dataclasses import dataclass

from bmad_first_project.domain.errors import DomainValidationError

BLANK_USERNAME_MESSAGE = "Enter a username."
EMPTY_PASSWORD_MESSAGE = "Enter a password."


@dataclass(frozen=True)
class Account:
    """The app's one account. `password_hash` is never the plain password."""

    username: str
    password_hash: str
    id: int | None = None


def normalise_username(raw: str) -> str:
    """Trim the username; it must not be empty afterwards."""
    username = raw.strip()
    if not username:
        raise DomainValidationError(BLANK_USERNAME_MESSAGE)
    return username


def check_password(password: str) -> str:
    """The password must be non-empty. It is never trimmed."""
    if not password:
        raise DomainValidationError(EMPTY_PASSWORD_MESSAGE)
    return password
