from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal["prompt", "condition", "output", "tool", "memory_read", "memory_write", "validator"]


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)


class WorkflowNodePayload(BaseModel):
    id: UUID
    node_type: NodeType
    label: str = Field(min_length=1, max_length=255)
    position_x: float
    position_y: float
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowEdgePayload(BaseModel):
    id: UUID
    source_node_id: UUID
    target_node_id: UUID
    source_handle: str | None = None
    target_handle: str | None = None
    label: str | None = None
    data: dict[str, Any] | None = None


class WorkflowSaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    nodes: list[WorkflowNodePayload] = Field(default_factory=list)
    edges: list[WorkflowEdgePayload] = Field(default_factory=list)


class WorkflowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    name: str
    description: str | None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    nodes: list[WorkflowNodePayload]
    edges: list[WorkflowEdgePayload]
