from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ProjectRole = Literal["owner", "editor", "viewer"]


class ProjectAccessRead(BaseModel):
    project_id: UUID
    role: ProjectRole
    can_edit: bool
    can_manage_members: bool
    can_run: bool


class ProjectMembershipCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    display_name: str | None = Field(default=None, max_length=120)
    role: ProjectRole = "viewer"


class ProjectMembershipUpdate(BaseModel):
    role: ProjectRole


class ProjectMembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    user_id: UUID
    role: ProjectRole
    added_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime
    user_email: str
    user_display_name: str
