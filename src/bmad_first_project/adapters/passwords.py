"""Password hashing adapter: Argon2 through pwdlib. Used for passwords only."""

from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher


class Argon2PasswordHasher:
    """A `PasswordHasher` that stores Argon2id hashes."""

    def __init__(self) -> None:
        self._hash = PasswordHash((Argon2Hasher(),))

    def hash(self, password: str) -> str:
        return self._hash.hash(password)

    def verify(self, password: str, password_hash: str) -> bool:
        return self._hash.verify(password, password_hash)
