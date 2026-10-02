"""The SQL unit of work: the only place in the codebase that commits."""

from types import TracebackType
from typing import Self

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from bmad_first_project.adapters.persistence.accounts import SqlAccountStore
from bmad_first_project.adapters.persistence.sessions import SqlSessionStore
from bmad_first_project.adapters.persistence.tasks import SqlTaskRepository


class SqlUnitOfWork:
    """Owns one `Session` per `with` block; commits on success, rolls back on error."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._session: Session | None = None
        self._accounts: SqlAccountStore | None = None
        self._sessions: SqlSessionStore | None = None
        self._tasks: SqlTaskRepository | None = None

    @property
    def session(self) -> Session:
        """The open session, for repositories in this adapter only."""
        if self._session is None:
            raise RuntimeError("SqlUnitOfWork is not active; use it in a `with` block.")
        return self._session

    @property
    def accounts(self) -> SqlAccountStore:
        """The account store, bound to this unit of work's session."""
        if self._accounts is None:
            raise RuntimeError("SqlUnitOfWork is not active; use it in a `with` block.")
        return self._accounts

    @property
    def sessions(self) -> SqlSessionStore:
        """The session store, bound to this unit of work's session."""
        if self._sessions is None:
            raise RuntimeError("SqlUnitOfWork is not active; use it in a `with` block.")
        return self._sessions

    @property
    def tasks(self) -> SqlTaskRepository:
        """The task repository, bound to this unit of work's session."""
        if self._tasks is None:
            raise RuntimeError("SqlUnitOfWork is not active; use it in a `with` block.")
        return self._tasks

    def __enter__(self) -> Self:
        if self._session is not None:
            raise RuntimeError("SqlUnitOfWork is already active.")
        self._session = Session(self._engine)
        self._accounts = SqlAccountStore(self._session)
        self._sessions = SqlSessionStore(self._session)
        self._tasks = SqlTaskRepository(self._session)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        session = self.session
        try:
            if exc_type is None:
                session.commit()
            else:
                session.rollback()
        finally:
            try:
                session.close()
            finally:
                self._session = None
                self._accounts = None
                self._sessions = None
                self._tasks = None
