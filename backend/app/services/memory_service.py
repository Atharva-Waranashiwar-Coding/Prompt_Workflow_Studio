from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import WorkflowMemoryEntry

MemoryScope = Literal["project", "workflow", "run"]


def normalize_memory_scope(raw_scope: object) -> MemoryScope:
    scope = str(raw_scope or "workflow").strip().lower()
    if scope not in {"project", "workflow", "run"}:
        raise ValueError("memoryScope must be one of: project, workflow, run.")
    return scope  # type: ignore[return-value]


def _base_scope_stmt(
    scope: MemoryScope,
    project_id: UUID,
    workflow_id: UUID,
    run_id: UUID | None,
    memory_key: str,
):
    stmt = select(WorkflowMemoryEntry).where(WorkflowMemoryEntry.scope == scope, WorkflowMemoryEntry.memory_key == memory_key)

    if scope == "project":
        return stmt.where(WorkflowMemoryEntry.project_id == project_id)
    if scope == "workflow":
        return stmt.where(WorkflowMemoryEntry.workflow_id == workflow_id)

    if run_id is None:
        raise ValueError("run-scoped memory requires a run id.")
    return stmt.where(WorkflowMemoryEntry.run_id == run_id)


def read_memory_entry(
    db: Session,
    *,
    project_id: UUID,
    workflow_id: UUID,
    run_id: UUID | None,
    scope: MemoryScope,
    memory_key: str,
) -> WorkflowMemoryEntry | None:
    stmt = _base_scope_stmt(
        scope=scope,
        project_id=project_id,
        workflow_id=workflow_id,
        run_id=run_id,
        memory_key=memory_key,
    )
    stmt = stmt.order_by(WorkflowMemoryEntry.updated_at.desc())
    return db.scalar(stmt)


def write_memory_entry(
    db: Session,
    *,
    project_id: UUID,
    workflow_id: UUID,
    run_id: UUID | None,
    scope: MemoryScope,
    memory_key: str,
    value: object,
) -> WorkflowMemoryEntry:
    existing = read_memory_entry(
        db,
        project_id=project_id,
        workflow_id=workflow_id,
        run_id=run_id,
        scope=scope,
        memory_key=memory_key,
    )

    if existing is None:
        entry = WorkflowMemoryEntry(
            project_id=project_id,
            workflow_id=workflow_id,
            run_id=run_id if scope == "run" else None,
            scope=scope,
            memory_key=memory_key,
            value_json=value,
        )
        db.add(entry)
        db.flush()
        return entry

    existing.value_json = value
    if scope == "run":
        existing.run_id = run_id
    db.flush()
    return existing
