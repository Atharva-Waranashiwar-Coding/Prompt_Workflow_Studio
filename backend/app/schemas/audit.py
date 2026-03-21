from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID | None
    workflow_id: UUID | None
    run_id: UUID | None
    user_id: UUID | None
    action: str
    entity_type: str
    entity_id: str | None
    metadata_json: dict[str, Any] | None
    created_at: datetime


class AuditLogListRead(BaseModel):
    items: list[AuditLogRead]
    total: int


class AuditLogQuery(BaseModel):
    limit: int = Field(default=30, ge=1, le=200)
    action: str | None = None
