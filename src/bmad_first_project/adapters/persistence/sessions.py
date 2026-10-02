"""The SQL `SessionStore`. Never commits; the unit of work does."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from bmad_first_project.adapters.persistence.tables import SessionRow
from bmad_first_project.domain.session import UserSession


def _to_domain(row: SessionRow) -> UserSession:
    return UserSession(
        id=row.id,
        token_hash=row.token_hash,
        account_id=row.account_id,
        expires_at=row.expires_at,
    )


class SqlSessionStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, session: UserSession) -> None:
        self._session.add(
            SessionRow(
                token_hash=session.token_hash,
                account_id=session.account_id,
                expires_at=session.expires_at,
            )
        )

    def get(self, token_hash: str) -> UserSession | None:
        query = select(SessionRow).where(SessionRow.token_hash == token_hash)
        row = self._session.scalars(query).one_or_none()
        return None if row is None else _to_domain(row)

    def delete(self, token_hash: str) -> None:
        self._session.execute(
            delete(SessionRow).where(SessionRow.token_hash == token_hash)
        )

    def delete_all(self) -> None:
        self._session.execute(delete(SessionRow))
