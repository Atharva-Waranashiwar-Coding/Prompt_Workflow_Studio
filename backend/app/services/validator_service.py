from typing import Any

ValidationRuleType = str


def _stringify(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _resolve_path(value: Any, path: str) -> Any:
    if not path:
        return value

    current = value
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        return None
    return current


def _validate_required_fields(payload: Any, required_fields: list[str], errors: list[str]) -> None:
    if not required_fields:
        return
    if not isinstance(payload, dict):
        errors.append("Required field validation expects object payload.")
        return

    for field_name in required_fields:
        if field_name not in payload:
            errors.append(f"Missing required field '{field_name}'.")


def _validate_schema(payload: Any, schema: dict[str, Any], errors: list[str]) -> None:
    if not schema:
        return
    if not isinstance(payload, dict):
        errors.append("Schema validation expects object payload.")
        return

    required = schema.get("required", [])
    if isinstance(required, list):
        for key in required:
            if isinstance(key, str) and key not in payload:
                errors.append(f"Missing schema-required field '{key}'.")

    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        return

    for key, expected_type in properties.items():
        if not isinstance(key, str) or key not in payload:
            continue
        if not isinstance(expected_type, str):
            continue

        value = payload[key]
        if expected_type == "string" and not isinstance(value, str):
            errors.append(f"Field '{key}' must be a string.")
        if expected_type == "number" and not isinstance(value, (int, float)):
            errors.append(f"Field '{key}' must be a number.")
        if expected_type == "boolean" and not isinstance(value, bool):
            errors.append(f"Field '{key}' must be a boolean.")
        if expected_type == "object" and not isinstance(value, dict):
            errors.append(f"Field '{key}' must be an object.")
        if expected_type == "array" and not isinstance(value, list):
            errors.append(f"Field '{key}' must be an array.")


def _evaluate_rule(payload: Any, rule: dict[str, Any]) -> tuple[bool, str | None, dict[str, Any]]:
    raw_type = str(rule.get("type", "")).strip().lower()
    raw_path = str(rule.get("path", "")).strip()
    target_value = _resolve_path(payload, raw_path) if raw_path else payload

    summary: dict[str, Any] = {
        "type": raw_type,
        "path": raw_path or None,
        "value": target_value,
    }

    if raw_type == "non-empty":
        passed = bool(target_value)
        return passed, None if passed else "Expected non-empty value.", summary

    if raw_type == "equals":
        expected = rule.get("value")
        passed = target_value == expected
        summary["expected"] = expected
        return passed, None if passed else f"Expected value to equal {expected!r}.", summary

    if raw_type == "contains":
        expected = rule.get("value")
        summary["expected"] = expected
        if isinstance(target_value, str):
            passed = _stringify(expected) in target_value
        elif isinstance(target_value, list):
            passed = expected in target_value
        elif isinstance(target_value, dict):
            passed = _stringify(expected) in target_value
        else:
            passed = False
        return passed, None if passed else f"Expected value to contain {expected!r}.", summary

    return False, f"Unsupported validator rule type '{raw_type}'.", summary


def validate_payload(
    payload: Any,
    *,
    required_fields: list[str] | None = None,
    schema: dict[str, Any] | None = None,
    rules: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    safe_required_fields = [field for field in (required_fields or []) if isinstance(field, str) and field.strip()]
    safe_schema = schema if isinstance(schema, dict) else {}
    safe_rules = [rule for rule in (rules or []) if isinstance(rule, dict)]

    errors: list[str] = []
    rule_results: list[dict[str, Any]] = []

    _validate_required_fields(payload, safe_required_fields, errors)
    _validate_schema(payload, safe_schema, errors)

    for rule in safe_rules:
        passed, error_message, summary = _evaluate_rule(payload, rule)
        result = {"passed": passed, **summary}
        if error_message:
            result["error"] = error_message
            errors.append(error_message)
        rule_results.append(result)

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "required_fields": safe_required_fields,
        "schema": safe_schema,
        "rules": rule_results,
        "payload": payload,
    }
