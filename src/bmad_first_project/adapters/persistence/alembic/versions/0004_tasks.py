"""Tasks: one row per task, status stored as its string value.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUS_VALUES = "'to_do', 'in_progress', 'done', 'cancelled'"


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("due_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("previous_status", sa.String(), nullable=True),
        sa.CheckConstraint(
            f"status IN ({STATUS_VALUES})", name=op.f("ck_tasks_status")
        ),
        sa.CheckConstraint(
            f"previous_status IN ({STATUS_VALUES})",
            name=op.f("ck_tasks_previous_status"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tasks")),
    )


def downgrade() -> None:
    op.drop_table("tasks")
