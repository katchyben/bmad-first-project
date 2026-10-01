"""Username and password rules for the single account."""

import dataclasses

import pytest

from bmad_first_project.domain.account import (
    Account,
    check_password,
    normalise_username,
)
from bmad_first_project.domain.errors import DomainValidationError


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("benny", "benny"), ("  benny  ", "benny"), ("\tben ny\n", "ben ny")],
)
def test_username_is_trimmed(raw: str, expected: str) -> None:
    assert normalise_username(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "\t\n"])
def test_blank_username_is_rejected_calmly(raw: str) -> None:
    with pytest.raises(DomainValidationError) as caught:
        normalise_username(raw)

    assert caught.value.message == "Enter a username."


def test_empty_password_is_rejected_calmly() -> None:
    with pytest.raises(DomainValidationError) as caught:
        check_password("")

    assert caught.value.message == "Enter a password."


@pytest.mark.parametrize("password", ["s3cret", "  padded  ", " "])
def test_password_is_kept_exactly_as_typed(password: str) -> None:
    assert check_password(password) == password


def test_account_is_immutable() -> None:
    account = Account(username="benny", password_hash="$argon2id$x")

    with pytest.raises(dataclasses.FrozenInstanceError):
        account.username = "alice"  # type: ignore[misc]
    assert account.id is None
