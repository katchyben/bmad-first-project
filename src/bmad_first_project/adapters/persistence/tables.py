"""Table models. Import this module wherever `SQLModel.metadata` must be complete.

The constraint naming convention is set before any table is defined, so every
constraint has a stable name that SQLite batch migrations can refer to.
"""

from datetime import datetime

from sqlalchemy import CheckConstraint
from sqlmodel import Field, SQLModel

from bmad_first_project.adapters.persistence.types import UTCDateTime
from bmad_first_project.domain.task import TaskStatus

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

SQLModel.metadata.naming_convention = NAMING_CONVENTION
metadata = SQLModel.metadata


class AccountRow(SQLModel, table=True):
    __tablename__ = "account"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True)
    password_hash: str


class SessionRow(SQLModel, table=True):
    __tablename__ = "sessions"

    id: int | None = Field(default=None, primary_key=True)
    token_hash: str = Field(unique=True)
    account_id: int = Field(foreign_key="account.id", ondelete="CASCADE")
    expires_at: datetime = Field(sa_type=UTCDateTime)


_TASK_STATUS_VALUES = ", ".join(f"'{status.value}'" for status in TaskStatus)


class TaskRow(SQLModel, table=True):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(f"status IN ({_TASK_STATUS_VALUES})", name="status"),
        CheckConstraint(
            f"previous_status IN ({_TASK_STATUS_VALUES})", name="previous_status"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    title: str
    description: str | None = None
    due_at: datetime = Field(sa_type=UTCDateTime)
    status: str
    created_at: datetime = Field(sa_type=UTCDateTime)
    finished_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    previous_status: str | None = None
