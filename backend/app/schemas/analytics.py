from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RunStatusCountsRead(BaseModel):
    total: int
    queued: int
    running: int
    completed: int
    failed: int
    cancelled: int
    timed_out: int


class ToolUsageRead(BaseModel):
    tool_name: str
    count: int


class RecentActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    action: str
    entity_type: str
    entity_id: str | None
    project_id: UUID | None
    workflow_id: UUID | None
    run_id: UUID | None
    user_id: UUID | None
    created_at: datetime


class DashboardAnalyticsRead(BaseModel):
    total_projects: int
    total_workflows: int
    run_counts: RunStatusCountsRead
    failed_runs: int
    most_used_tools: list[ToolUsageRead]
    recent_activity: list[RecentActivityRead]
