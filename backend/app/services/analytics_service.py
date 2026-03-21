from collections import Counter
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.project import Project
from app.models.run import WorkflowRun, WorkflowRunStep
from app.models.workflow import Workflow
from app.services.access_service import list_accessible_project_ids, require_project_access


@dataclass
class DashboardAnalytics:
    total_projects: int
    total_workflows: int
    run_counts: dict[str, int]
    failed_runs: int
    most_used_tools: list[dict[str, Any]]
    recent_activity: list[AuditLog]


def _ensure_project_scope(
    db: Session,
    *,
    user_id: UUID,
    project_id: UUID | None = None,
) -> list[UUID]:
    if project_id is not None:
        require_project_access(db, project_id=project_id, user_id=user_id)
        return [project_id]

    return list_accessible_project_ids(db, user_id=user_id)


def _run_status_counts(db: Session, project_ids: list[UUID]) -> dict[str, int]:
    base = {
        "total": 0,
        "queued": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
        "timed_out": 0,
    }
    if not project_ids:
        return base

    stmt = (
        select(WorkflowRun.status, func.count())
        .join(Workflow, Workflow.id == WorkflowRun.workflow_id)
        .where(Workflow.project_id.in_(project_ids))
        .group_by(WorkflowRun.status)
    )
    for status, count in db.execute(stmt).all():
        base[str(status)] = int(count)
        base["total"] += int(count)
    return base


def _most_used_tools(db: Session, project_ids: list[UUID], limit: int = 5) -> list[dict[str, Any]]:
    if not project_ids:
        return []

    stmt = (
        select(WorkflowRunStep.output_payload)
        .join(WorkflowRun, WorkflowRun.id == WorkflowRunStep.run_id)
        .join(Workflow, Workflow.id == WorkflowRun.workflow_id)
        .where(
            Workflow.project_id.in_(project_ids),
            WorkflowRunStep.node_type == "tool",
            WorkflowRunStep.status == "completed",
        )
    )
    tool_counter: Counter[str] = Counter()
    for output_payload in db.scalars(stmt):
        if not isinstance(output_payload, dict):
            continue
        tool_name = output_payload.get("tool_name")
        if isinstance(tool_name, str) and tool_name.strip():
            tool_counter[tool_name.strip()] += 1

    return [
        {"tool_name": tool_name, "count": count}
        for tool_name, count in tool_counter.most_common(limit)
    ]


def get_dashboard_analytics(
    db: Session,
    *,
    user_id: UUID,
    project_id: UUID | None = None,
    recent_limit: int = 20,
) -> DashboardAnalytics:
    project_ids = _ensure_project_scope(db, user_id=user_id, project_id=project_id)

    total_projects_stmt = select(func.count()).select_from(Project).where(Project.id.in_(project_ids))
    total_projects = int(db.scalar(total_projects_stmt) or 0) if project_ids else 0

    total_workflows_stmt = select(func.count()).select_from(Workflow).where(Workflow.project_id.in_(project_ids))
    total_workflows = int(db.scalar(total_workflows_stmt) or 0) if project_ids else 0

    run_counts = _run_status_counts(db, project_ids)
    failed_runs = run_counts["failed"] + run_counts["timed_out"]
    most_used_tools = _most_used_tools(db, project_ids, limit=5)

    recent_activity_stmt = (
        select(AuditLog)
        .where(AuditLog.project_id.in_(project_ids))
        .order_by(AuditLog.created_at.desc())
        .limit(max(1, min(recent_limit, 100)))
    )
    recent_activity = list(db.scalars(recent_activity_stmt).all()) if project_ids else []

    return DashboardAnalytics(
        total_projects=total_projects,
        total_workflows=total_workflows,
        run_counts=run_counts,
        failed_runs=failed_runs,
        most_used_tools=most_used_tools,
        recent_activity=recent_activity,
    )
