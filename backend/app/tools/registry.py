from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    title: str
    description: str
    parameter_schema: dict[str, Any]
    default_params: dict[str, Any]


TOOL_DEFINITIONS: tuple[ToolDefinition, ...] = (
    ToolDefinition(
        name="template_fetch",
        title="Template Fetch",
        description="Fetch a prompt template from local template storage.",
        parameter_schema={"template_key": "string"},
        default_params={"template_key": "default_support"},
    ),
    ToolDefinition(
        name="memory_read",
        title="Memory Read",
        description="Read a value from local workflow memory by key.",
        parameter_schema={"memory_key": "string"},
        default_params={"memory_key": "session.summary"},
    ),
    ToolDefinition(
        name="memory_write",
        title="Memory Write",
        description="Write a value to local workflow memory by key.",
        parameter_schema={"memory_key": "string", "value": "any"},
        default_params={"memory_key": "session.summary", "value": "{{last_output}}"},
    ),
    ToolDefinition(
        name="document_lookup",
        title="Document Lookup",
        description="Search local indexed documents by query text.",
        parameter_schema={"query": "string", "max_results": "integer"},
        default_params={"query": "billing", "max_results": 3},
    ),
    ToolDefinition(
        name="output_schema_validate",
        title="Output Schema Validate",
        description="Validate payload keys/types against a simple local schema.",
        parameter_schema={"schema": "object", "payload": "object|null"},
        default_params={
            "schema": {
                "required": ["result"],
                "properties": {"result": "string"},
            }
        },
    ),
)

TOOL_DEFINITIONS_BY_NAME: dict[str, ToolDefinition] = {tool.name: tool for tool in TOOL_DEFINITIONS}


def list_tool_definitions() -> list[ToolDefinition]:
    return list(TOOL_DEFINITIONS)


def get_tool_definition(name: str) -> ToolDefinition | None:
    return TOOL_DEFINITIONS_BY_NAME.get(name)
