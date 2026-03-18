from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.tool_data import ToolDocument, ToolMemoryEntry, ToolTemplate
from app.tools.registry import get_tool_definition


def _require_string(params: dict[str, Any], key: str) -> str:
    value = params.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"'{key}' must be a non-empty string.")
    return value.strip()


def _tool_template_fetch(db: Session, params: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    template_key = _require_string(params, "template_key")
    template = db.scalar(select(ToolTemplate).where(ToolTemplate.template_key == template_key))
    if template is None:
        raise ValueError(f"Template '{template_key}' was not found.")

    return {
        "template_key": template.template_key,
        "content": template.content,
        "description": template.description,
    }


def _tool_memory_read(db: Session, params: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    memory_key = _require_string(params, "memory_key")
    entry = db.get(ToolMemoryEntry, memory_key)
    if entry is None:
        return {"memory_key": memory_key, "found": False, "value": None}

    return {"memory_key": memory_key, "found": True, "value": entry.value_json}


def _tool_memory_write(db: Session, params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    memory_key = _require_string(params, "memory_key")
    value = params.get("value", context.get("last_output"))

    entry = db.get(ToolMemoryEntry, memory_key)
    if entry is None:
        entry = ToolMemoryEntry(memory_key=memory_key, value_json=value if isinstance(value, dict) else {"value": value})
        db.add(entry)
    else:
        entry.value_json = value if isinstance(value, dict) else {"value": value}

    db.flush()
    return {"memory_key": memory_key, "stored": True, "value": entry.value_json}


def _tool_document_lookup(db: Session, params: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    query = _require_string(params, "query")
    max_results_raw = params.get("max_results", 3)
    try:
        max_results = int(max_results_raw) if isinstance(max_results_raw, (int, float, str)) else 3
    except (TypeError, ValueError):
        max_results = 3
    max_results = max(1, min(max_results, 20))

    pattern = f"%{query.lower()}%"
    stmt = (
        select(ToolDocument)
        .where(
            or_(
                ToolDocument.title.ilike(pattern),
                ToolDocument.content.ilike(pattern),
                ToolDocument.document_key.ilike(pattern),
            )
        )
        .order_by(ToolDocument.updated_at.desc())
        .limit(max_results)
    )

    docs = list(db.scalars(stmt).all())
    return {
        "query": query,
        "matches": [
            {
                "document_key": doc.document_key,
                "title": doc.title,
                "snippet": doc.content[:240],
                "metadata": doc.metadata_json,
            }
            for doc in docs
        ],
        "count": len(docs),
    }


def _tool_output_schema_validate(_: Session, params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    schema = params.get("schema")
    payload = params.get("payload", context.get("last_output"))

    if not isinstance(schema, dict):
        raise ValueError("'schema' must be an object.")

    errors: list[str] = []
    if not isinstance(payload, dict):
        errors.append("Payload must be an object.")
    else:
        required = schema.get("required", [])
        if isinstance(required, list):
            for key in required:
                if isinstance(key, str) and key not in payload:
                    errors.append(f"Missing required key: {key}")

        properties = schema.get("properties", {})
        if isinstance(properties, dict):
            for key, expected_type in properties.items():
                if key not in payload:
                    continue
                if not isinstance(expected_type, str):
                    continue

                value = payload[key]
                if expected_type == "string" and not isinstance(value, str):
                    errors.append(f"Key '{key}' must be a string.")
                if expected_type == "number" and not isinstance(value, (int, float)):
                    errors.append(f"Key '{key}' must be a number.")
                if expected_type == "boolean" and not isinstance(value, bool):
                    errors.append(f"Key '{key}' must be a boolean.")
                if expected_type == "object" and not isinstance(value, dict):
                    errors.append(f"Key '{key}' must be an object.")
                if expected_type == "array" and not isinstance(value, list):
                    errors.append(f"Key '{key}' must be an array.")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "payload": payload,
        "schema": schema,
    }


_TOOL_EXECUTORS = {
    "template_fetch": _tool_template_fetch,
    "memory_read": _tool_memory_read,
    "memory_write": _tool_memory_write,
    "document_lookup": _tool_document_lookup,
    "output_schema_validate": _tool_output_schema_validate,
}


def invoke_tool_by_name(
    db: Session,
    tool_name: str,
    params: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    definition = get_tool_definition(tool_name)
    if definition is None:
        raise ValueError(f"Unsupported tool '{tool_name}'.")

    executor = _TOOL_EXECUTORS.get(tool_name)
    if executor is None:
        raise ValueError(f"Tool '{tool_name}' is registered but has no executor.")

    safe_params = params or {}
    safe_context = context or {}
    output = executor(db, safe_params, safe_context)
    if not isinstance(output, dict):
        raise ValueError(f"Tool '{tool_name}' returned non-object output.")

    return {
        "tool_name": definition.name,
        "tool_title": definition.title,
        "params": safe_params,
        "result": output,
    }
