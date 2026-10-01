"""`Argon2PasswordHasher` stores salted Argon2id hashes and verifies them."""

from bmad_first_project.adapters.passwords import Argon2PasswordHasher


def test_hash_is_argon2id_and_verifies() -> None:
    hasher = Argon2PasswordHasher()

    first = hasher.hash("s3cret")

    assert first.startswith("$argon2id$")
    assert hasher.verify("s3cret", first)
    assert not hasher.verify("wrong", first)
    assert hasher.hash("s3cret") != first
