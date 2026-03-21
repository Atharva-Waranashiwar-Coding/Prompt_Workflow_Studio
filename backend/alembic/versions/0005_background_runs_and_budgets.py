"""Add background run metadata, cancellation, retries, and budget tracking.

Revision ID: 0005_background_runs_and_budgets
Revises: 0004_workflow_memory
Create Date: 2026-03-21 12:50:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_background_runs_and_budgets"
down_revision: Union[str, None] = "0004_workflow_memory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_runs",
        sa.Column("input_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "workflow_runs",
        sa.Column("execution_options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("workflow_runs", sa.Column("celery_task_id", sa.String(length=255), nullable=True))
    op.add_column("workflow_runs", sa.Column("queue_name", sa.String(length=120), nullable=True))
    op.add_column("workflow_runs", sa.Column("worker_name", sa.String(length=255), nullable=True))
    op.add_column("workflow_runs", sa.Column("timeout_seconds", sa.Integer(), nullable=True))
    op.add_column("workflow_runs", sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "workflow_runs",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("workflow_runs", sa.Column("retry_reason", sa.Text(), nullable=True))
    op.add_column("workflow_runs", sa.Column("token_budget", sa.Integer(), nullable=True))
    op.add_column(
        "workflow_runs",
        sa.Column("token_used", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("workflow_runs", sa.Column("context_budget", sa.Integer(), nullable=True))
    op.add_column(
        "workflow_runs",
        sa.Column("context_used", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.create_index(op.f("ix_workflow_runs_celery_task_id"), "workflow_runs", ["celery_task_id"], unique=False)

    op.add_column(
        "workflow_run_steps",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("workflow_run_steps", sa.Column("retry_reason", sa.Text(), nullable=True))
    op.add_column(
        "workflow_run_steps",
        sa.Column("token_used", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "workflow_run_steps",
        sa.Column("context_used", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.alter_column("workflow_runs", "retry_count", server_default=None)
    op.alter_column("workflow_runs", "token_used", server_default=None)
    op.alter_column("workflow_runs", "context_used", server_default=None)
    op.alter_column("workflow_run_steps", "retry_count", server_default=None)
    op.alter_column("workflow_run_steps", "token_used", server_default=None)
    op.alter_column("workflow_run_steps", "context_used", server_default=None)


def downgrade() -> None:
    op.drop_column("workflow_run_steps", "context_used")
    op.drop_column("workflow_run_steps", "token_used")
    op.drop_column("workflow_run_steps", "retry_reason")
    op.drop_column("workflow_run_steps", "retry_count")

    op.drop_index(op.f("ix_workflow_runs_celery_task_id"), table_name="workflow_runs")
    op.drop_column("workflow_runs", "context_used")
    op.drop_column("workflow_runs", "context_budget")
    op.drop_column("workflow_runs", "token_used")
    op.drop_column("workflow_runs", "token_budget")
    op.drop_column("workflow_runs", "retry_reason")
    op.drop_column("workflow_runs", "retry_count")
    op.drop_column("workflow_runs", "cancel_requested_at")
    op.drop_column("workflow_runs", "timeout_seconds")
    op.drop_column("workflow_runs", "worker_name")
    op.drop_column("workflow_runs", "queue_name")
    op.drop_column("workflow_runs", "celery_task_id")
    op.drop_column("workflow_runs", "execution_options")
    op.drop_column("workflow_runs", "input_payload")
