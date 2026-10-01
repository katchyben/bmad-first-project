"""The SQL `AccountStore`. Never commits; the unit of work does."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from bmad_first_project.adapters.persistence.tables import AccountRow
from bmad_first_project.domain.account import Account


def _to_domain(row: AccountRow) -> Account:
    return Account(id=row.id, username=row.username, password_hash=row.password_hash)


class SqlAccountStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self) -> Account | None:
        row = self._session.scalars(select(AccountRow)).one_or_none()
        return None if row is None else _to_domain(row)

    def add(self, account: Account) -> None:
        self._session.add(
            AccountRow(username=account.username, password_hash=account.password_hash)
        )

    def save(self, account: Account) -> None:
        row = None if account.id is None else self._session.get(AccountRow, account.id)
        if row is None:
            raise LookupError("Only an account returned by `get` can be saved.")
        row.username = account.username
        row.password_hash = account.password_hash
