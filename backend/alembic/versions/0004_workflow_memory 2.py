"""Add structured workflow memory entries for memory nodes.

Revision ID: 0004_workflow_memory
Revises: 0003_tool_data_and_mcp
Create Date: 2026-03-21 12:10:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_workflow_memory"
down_revision: Union[str, None] = "0003_tool_data_and_mcp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflow_memory_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("memory_key", sa.String(length=160), nullable=False),
        sa.Column("value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["workflow_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workflow_memory_entries_created_at"), "workflow_memory_entries", ["created_at"], unique=False)
    op.create_index(op.f("ix_workflow_memory_entries_memory_key"), "workflow_memory_entries", ["memory_key"], unique=False)
    op.create_index(op.f("ix_workflow_memory_entries_project_id"), "workflow_memory_entries", ["project_id"], unique=False)
    op.create_index(op.f("ix_workflow_memory_entries_run_id"), "workflow_memory_entries", ["run_id"], unique=False)
    op.create_index(op.f("ix_workflow_memory_entries_scope"), "workflow_memory_entries", ["scope"], unique=False)
    op.create_index(op.f("ix_workflow_memory_entries_workflow_id"), "workflow_memory_entries", ["workflow_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workflow_memory_entries_workflow_id"), table_name="workflow_memory_entries")
    op.drop_index(op.f("ix_workflow_memory_entries_scope"), table_name="workflow_memory_entries")
    op.drop_index(op.f("ix_workflow_memory_entries_run_id"), table_name="workflow_memory_entries")
    op.drop_index(op.f("ix_workflow_memory_entries_project_id"), table_name="workflow_memory_entries")
    op.drop_index(op.f("ix_workflow_memory_entries_memory_key"), table_name="workflow_memory_entries")
    op.drop_index(op.f("ix_workflow_memory_entries_created_at"), table_name="workflow_memory_entries")
    op.drop_table("workflow_memory_entries")
