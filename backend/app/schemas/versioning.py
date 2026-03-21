from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.workflow import WorkflowEdgePayload, WorkflowNodePayload, WorkflowRead


class WorkflowVersionPublishRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class WorkflowVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workflow_id: UUID
    version_number: int
    name: str
    description: str | None
    nodes_snapshot: list[dict[str, Any]]
    edges_snapshot: list[dict[str, Any]]
    tags_snapshot: list[str]
    published_by_user_id: UUID | None
    publish_note: str | None
    created_at: datetime


class WorkflowDuplicateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    target_project_id: UUID | None = None
    publish_note: str | None = Field(default=None, max_length=1000)


class WorkflowRestoreResponse(BaseModel):
    workflow: WorkflowRead
    restored_from_version_id: UUID


class WorkflowGraphSnapshot(BaseModel):
    name: str
    description: str | None
    tags: list[str]
    nodes: list[WorkflowNodePayload]
    edges: list[WorkflowEdgePayload]
