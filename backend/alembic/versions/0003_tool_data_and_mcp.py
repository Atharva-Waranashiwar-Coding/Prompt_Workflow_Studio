"""Add local tool data tables for MCP tool integrations.

Revision ID: 0003_tool_data_and_mcp
Revises: 0002_workflow_runs
Create Date: 2026-03-18 19:15:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_tool_data_and_mcp"
down_revision: Union[str, None] = "0002_workflow_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tool_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_key", sa.String(length=120), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_key"),
    )
    op.create_index(op.f("ix_tool_templates_template_key"), "tool_templates", ["template_key"], unique=True)

    op.create_table(
        "tool_memory_entries",
        sa.Column("memory_key", sa.String(length=160), nullable=False),
        sa.Column("value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("memory_key"),
    )

    op.create_table(
        "tool_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_key", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_key"),
    )
    op.create_index(op.f("ix_tool_documents_document_key"), "tool_documents", ["document_key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_tool_documents_document_key"), table_name="tool_documents")
    op.drop_table("tool_documents")

    op.drop_table("tool_memory_entries")

    op.drop_index(op.f("ix_tool_templates_template_key"), table_name="tool_templates")
    op.drop_table("tool_templates")
