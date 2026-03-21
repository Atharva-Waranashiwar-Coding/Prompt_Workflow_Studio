from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

RunStatus = Literal["queued", "running", "completed", "failed", "cancelled", "timed_out"]
StepStatus = Literal["running", "completed", "failed", "cancelled", "timed_out"]


class WorkflowRunTriggerRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)
    token_budget: int | None = Field(default=None, ge=1)
    context_budget: int | None = Field(default=None, ge=1)
    timeout_seconds: int | None = Field(default=None, ge=1)
    retry_reason: str | None = None


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
    retry_count: int
    retry_reason: str | None
    token_used: int
    context_used: int
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
    celery_task_id: str | None
    queue_name: str | None
    worker_name: str | None
    timeout_seconds: int | None
    cancel_requested_at: datetime | None
    retry_count: int
    retry_reason: str | None
    token_budget: int | None
    token_used: int
    context_budget: int | None
    context_used: int
    result_payload: Any | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class WorkflowRunDetailRead(WorkflowRunRead):
    steps: list[WorkflowRunStepRead]


class WorkflowRunStepRetryRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)
    token_budget: int | None = Field(default=None, ge=1)
    context_budget: int | None = Field(default=None, ge=1)
    timeout_seconds: int | None = Field(default=None, ge=1)
    retry_reason: str | None = None


class WorkflowRunRetryRequest(BaseModel):
    input_payload: dict[str, Any] = Field(default_factory=dict)
    token_budget: int | None = Field(default=None, ge=1)
    context_budget: int | None = Field(default=None, ge=1)
    timeout_seconds: int | None = Field(default=None, ge=1)
    retry_reason: str | None = None
