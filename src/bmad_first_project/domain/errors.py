"""Domain error types; the HTTP adapter maps each one to an error envelope."""


class DomainError(Exception):
    """Base for every domain error. `message` is shown to the user as is."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class DomainValidationError(DomainError):
    """A value breaks a domain rule."""


class StateConflictError(DomainError):
    """The action conflicts with the current state; `reason` says which way."""

    def __init__(self, message: str, reason: str | None = None) -> None:
        super().__init__(message)
        self.reason = reason


class NotFoundError(DomainError):
    """The requested thing does not exist."""


class UnauthenticatedError(DomainError):
    """The caller is not logged in, or their credentials are not valid."""
