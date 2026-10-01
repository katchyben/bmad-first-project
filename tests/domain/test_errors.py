"""Domain error types carry a user-facing message, and 409s an optional reason."""

import pytest

from bmad_first_project.domain.errors import (
    DomainError,
    DomainValidationError,
    NotFoundError,
    StateConflictError,
    UnauthenticatedError,
)


@pytest.mark.parametrize(
    "error_type",
    [DomainValidationError, StateConflictError, NotFoundError, UnauthenticatedError],
)
def test_each_error_is_a_domain_error_with_a_message(
    error_type: type[DomainError],
) -> None:
    error = error_type("That didn't work.")

    assert isinstance(error, DomainError)
    assert isinstance(error, Exception)
    assert error.message == "That didn't work."
    assert str(error) == "That didn't work."


def test_state_conflict_reason_defaults_to_none() -> None:
    assert StateConflictError("Already done.").reason is None


def test_state_conflict_carries_reason() -> None:
    error = StateConflictError("Already done.", reason="already_finished")

    assert error.message == "Already done."
    assert error.reason == "already_finished"
