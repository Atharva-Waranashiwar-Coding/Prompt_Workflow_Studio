from typing import Any

from pydantic import BaseModel, Field


class ToolDefinitionRead(BaseModel):
    name: str
    title: str
    description: str
    parameter_schema: dict[str, Any]
    default_params: dict[str, Any]


class ToolInvocationRequest(BaseModel):
    params: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class ToolInvocationResponse(BaseModel):
    tool_name: str
    output: dict[str, Any]
