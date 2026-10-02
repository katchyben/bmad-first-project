"""Table models. Import this module wherever `SQLModel.metadata` must be complete.

The constraint naming convention is set before any table is defined, so every
constraint has a stable name that SQLite batch migrations can refer to.
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from bmad_first_project.adapters.persistence.types import UTCDateTime

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
