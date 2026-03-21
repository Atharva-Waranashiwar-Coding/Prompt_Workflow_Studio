from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def record_audit_log(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    project_id: UUID | None = None,
    workflow_id: UUID | None = None,
    run_id: UUID | None = None,
    user_id: UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        project_id=project_id,
        workflow_id=workflow_id,
        run_id=run_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=metadata or None,
        created_at=_utcnow(),
    )
    db.add(entry)
    db.flush()
    return entry


def list_project_audit_logs(
    db: Session,
    *,
    project_id: UUID,
    limit: int = 30,
    action: str | None = None,
) -> tuple[list[AuditLog], int]:
    filters = [AuditLog.project_id == project_id]
    if action:
        filters.append(AuditLog.action == action)

    total_stmt = select(func.count()).select_from(AuditLog).where(*filters)
    total = int(db.scalar(total_stmt) or 0)

    items_stmt = (
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    items = list(db.scalars(items_stmt).all())
    return items, total
