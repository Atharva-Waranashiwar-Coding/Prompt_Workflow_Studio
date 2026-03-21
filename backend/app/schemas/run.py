from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

RunStatus = Literal["queued", "running", "completed", "failed"]
StepStatus = Literal["running", "completed", "failed"]


class WorkflowRunTriggerRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)


class WorkflowRunStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    step_index: int
    node_id: UUID
    node_type: str
    node_label: str
    status: StepStatus
    input_payload: Any | None
    output_payload: Any | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class WorkflowRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workflow_id: UUID
    triggered_by_user_id: UUID | None
    status: RunStatus
    error_message: str | None
    result_payload: Any | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class WorkflowRunDetailRead(WorkflowRunRead):
    steps: list[WorkflowRunStepRead]


class WorkflowRunStepRetryRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)
