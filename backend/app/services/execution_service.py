import ast
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.project import Project
from app.models.run import WorkflowRun, WorkflowRunStep
from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode
from app.services.memory_service import normalize_memory_scope, read_memory_entry, write_memory_entry
from app.services.tool_service import invoke_tool_by_name
from app.services.validator_service import validate_payload
from app.tools.registry import get_tool_definition

RUN_STATUS_QUEUED = "queued"
RUN_STATUS_RUNNING = "running"
RUN_STATUS_COMPLETED = "completed"
RUN_STATUS_FAILED = "failed"

STEP_STATUS_RUNNING = "running"
STEP_STATUS_COMPLETED = "completed"
STEP_STATUS_FAILED = "failed"

CONDITION_TRUE_HANDLE = "true"
CONDITION_FALSE_HANDLE = "false"

SUPPORTED_NODE_TYPES = {"prompt", "condition", "output", "tool", "memory_read", "memory_write", "validator"}


@dataclass
class ExecutionGraph:
    start_node_id: UUID
    nodes_by_id: dict[UUID, WorkflowNode]
    outgoing_edges: dict[UUID, list[WorkflowEdge]]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_json(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _stringify(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, default=str)


def _extract_condition_operand(value: object) -> object:
    if isinstance(value, dict):
        if "simulated_response" in value:
            return value["simulated_response"]
        if "result" in value:
            return _extract_condition_operand(value["result"])
    return value


def _parse_literal(token: str) -> object:
    try:
        return ast.literal_eval(token)
    except (ValueError, SyntaxError):
        return token.strip().strip('"').strip("'")


def _resolve_context_path(context: dict[str, Any], path: str) -> Any:
    current: Any = context
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        return None
    return current


def _resolve_templates(value: Any, context: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _resolve_templates(sub_value, context) for key, sub_value in value.items()}
    if isinstance(value, list):
        return [_resolve_templates(item, context) for item in value]
    if not isinstance(value, str):
        return value

    matches = list(re.finditer(r"\{\{\s*([^}]+?)\s*\}\}", value))
    if not matches:
        return value

    if len(matches) == 1 and matches[0].span() == (0, len(value)):
        return _resolve_context_path(context, matches[0].group(1).strip())

    resolved = value
    for match in matches:
        token = match.group(1).strip()
        replacement = _resolve_context_path(context, token)
        resolved = resolved.replace(match.group(0), _stringify(replacement))
    return resolved


def _evaluate_condition_expression(expression: str, last_output: object) -> bool:
    expr = expression.strip()
    lowered = expr.lower()

    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "not-empty":
        return bool(last_output)

    if lowered.startswith("contains:"):
        needle = expr.split(":", 1)[1].strip().strip('"').strip("'")
        return needle.lower() in _stringify(last_output).lower()

    if lowered.startswith("equals:"):
        expected = _parse_literal(expr.split(":", 1)[1].strip())
        left = _extract_condition_operand(last_output)
        return left == expected

    comparison_match = re.match(r"^last_output\s*(==|!=)\s*(.+)$", expr)
    if comparison_match:
        operator = comparison_match.group(1)
        right_operand = _parse_literal(comparison_match.group(2).strip())
        left_operand = _extract_condition_operand(last_output)
        comparison = left_operand == right_operand
        return comparison if operator == "==" else not comparison

    raise ValueError(
        "Unsupported condition expression. Use true/false, not-empty, contains:<text>, "
        "equals:<value>, or last_output == <value>."
    )


def _node_runtime_context(run_input: dict[str, Any], last_output: object, step_outputs: dict[str, Any], node_id: UUID) -> dict[str, Any]:
    return {
        "run_input": run_input,
        "last_output": last_output,
        "step_outputs": step_outputs,
        "node_id": str(node_id),
    }


def _require_memory_key(raw_value: Any, context: dict[str, Any]) -> str:
    resolved = _resolve_templates(raw_value, context)
    memory_key = str(resolved or "").strip()
    if not memory_key:
        raise ValueError("memoryKey must be a non-empty string.")
    return memory_key


def validate_workflow_for_execution(workflow: Workflow) -> ExecutionGraph:
    if not workflow.nodes:
        raise ValueError("Workflow has no nodes.")

    nodes_by_id = {node.id: node for node in workflow.nodes}
    outgoing_edges: dict[UUID, list[WorkflowEdge]] = {node_id: [] for node_id in nodes_by_id}
    incoming_count: dict[UUID, int] = {node_id: 0 for node_id in nodes_by_id}

    for edge in workflow.edges:
        if edge.source_node_id not in nodes_by_id or edge.target_node_id not in nodes_by_id:
            raise ValueError("Workflow contains edges with missing source or target nodes.")
        outgoing_edges[edge.source_node_id].append(edge)
        incoming_count[edge.target_node_id] += 1

    for node_id in outgoing_edges:
        outgoing_edges[node_id].sort(key=lambda edge: (edge.created_at or datetime.min, str(edge.id)))

    start_nodes = [node_id for node_id, count in incoming_count.items() if count == 0]
    if len(start_nodes) != 1:
        raise ValueError("Workflow must contain exactly one start node (a node with no incoming edge).")

    start_node_id = start_nodes[0]

    reachable: set[UUID] = set()

    def mark_reachable(node_id: UUID) -> None:
        if node_id in reachable:
            return
        reachable.add(node_id)
        for edge in outgoing_edges[node_id]:
            mark_reachable(edge.target_node_id)

    mark_reachable(start_node_id)

    disconnected_nodes = [node.label for node_id, node in nodes_by_id.items() if node_id not in reachable]
    if disconnected_nodes:
        raise ValueError(
            "Workflow contains disconnected nodes that are unreachable from the start: "
            + ", ".join(disconnected_nodes)
        )

    visiting: set[UUID] = set()
    visited: set[UUID] = set()

    def detect_cycle(node_id: UUID) -> None:
        if node_id in visiting:
            raise ValueError("Workflow graph contains a cycle. Execution v1 supports DAG-style flows only.")
        if node_id in visited:
            return

        visiting.add(node_id)
        for edge in outgoing_edges[node_id]:
            detect_cycle(edge.target_node_id)
        visiting.remove(node_id)
        visited.add(node_id)

    detect_cycle(start_node_id)

    reachable_output_nodes = [
        node for node_id, node in nodes_by_id.items() if node_id in reachable and node.node_type == "output"
    ]
    if not reachable_output_nodes:
        raise ValueError("Workflow must include at least one reachable output node.")

    for node_id, node in nodes_by_id.items():
        node_type = node.node_type
        node_config = node.config or {}
        outgoing = outgoing_edges[node_id]

        if node_type not in SUPPORTED_NODE_TYPES:
            raise ValueError(f"Unsupported node type '{node_type}' in workflow.")

        if node_type == "prompt":
            prompt_template = str(node_config.get("promptTemplate", "")).strip()
            if not prompt_template:
                raise ValueError(f"Prompt node '{node.label}' must have a non-empty promptTemplate.")
            if len(outgoing) != 1:
                raise ValueError(f"Prompt node '{node.label}' must have exactly one outgoing edge.")

        if node_type == "condition":
            condition_expression = str(node_config.get("conditionExpression", "")).strip()
            if not condition_expression:
                raise ValueError(f"Condition node '{node.label}' must have a non-empty conditionExpression.")

            true_edges = [
                edge for edge in outgoing if (edge.source_handle or "").strip().lower() == CONDITION_TRUE_HANDLE
            ]
            false_edges = [
                edge for edge in outgoing if (edge.source_handle or "").strip().lower() == CONDITION_FALSE_HANDLE
            ]

            if len(true_edges) != 1 or len(false_edges) != 1 or len(outgoing) != 2:
                raise ValueError(
                    f"Condition node '{node.label}' must have exactly two outgoing branches using source handles "
                    "'true' and 'false'."
                )

        if node_type == "output" and outgoing:
            raise ValueError(f"Output node '{node.label}' must not have outgoing edges.")

        if node_type == "tool":
            tool_name = str(node_config.get("toolName", "")).strip()
            if not tool_name:
                raise ValueError(f"Tool node '{node.label}' must define toolName.")
            if get_tool_definition(tool_name) is None:
                raise ValueError(f"Tool node '{node.label}' references unsupported tool '{tool_name}'.")
            tool_params = node_config.get("toolParams", {})
            if not isinstance(tool_params, dict):
                raise ValueError(f"Tool node '{node.label}' toolParams must be an object.")
            if len(outgoing) != 1:
                raise ValueError(f"Tool node '{node.label}' must have exactly one outgoing edge.")

        if node_type in {"memory_read", "memory_write"}:
            memory_key = str(node_config.get("memoryKey", "")).strip()
            if not memory_key:
                raise ValueError(f"{node_type} node '{node.label}' must define memoryKey.")
            normalize_memory_scope(node_config.get("memoryScope", "workflow"))
            if len(outgoing) != 1:
                raise ValueError(f"{node_type} node '{node.label}' must have exactly one outgoing edge.")

        if node_type == "validator":
            normalize_target = str(node_config.get("targetPath", "last_output")).strip() or "last_output"
            if normalize_target.count(" ") > 0:
                raise ValueError(f"Validator node '{node.label}' targetPath must not contain spaces.")

            required_fields = node_config.get("requiredFields", [])
            if not isinstance(required_fields, list):
                raise ValueError(f"Validator node '{node.label}' requiredFields must be an array.")
            if any(not isinstance(field, str) for field in required_fields):
                raise ValueError(f"Validator node '{node.label}' requiredFields must contain strings only.")

            schema = node_config.get("schema", {})
            if schema is not None and not isinstance(schema, dict):
                raise ValueError(f"Validator node '{node.label}' schema must be an object.")

            rules = node_config.get("rules", [])
            if not isinstance(rules, list):
                raise ValueError(f"Validator node '{node.label}' rules must be an array.")
            if any(not isinstance(rule, dict) for rule in rules):
                raise ValueError(f"Validator node '{node.label}' rules must contain objects only.")

            if len(outgoing) != 1:
                raise ValueError(f"Validator node '{node.label}' must have exactly one outgoing edge.")

    return ExecutionGraph(
        start_node_id=start_node_id,
        nodes_by_id=nodes_by_id,
        outgoing_edges=outgoing_edges,
    )


def _execute_prompt_node(node: WorkflowNode, run_input: dict[str, Any], last_output: object) -> dict[str, Any]:
    template = str((node.config or {}).get("promptTemplate", "")).strip()
    rendered_prompt = (
        template.replace("{{input}}", _stringify(run_input)).replace("{{last_output}}", _stringify(last_output))
    )
    return {
        "rendered_prompt": rendered_prompt,
        "simulated_response": f"Simulated response for: {rendered_prompt[:180]}",
    }


def _execute_condition_node(node: WorkflowNode, last_output: object) -> dict[str, Any]:
    expression = str((node.config or {}).get("conditionExpression", "")).strip()
    result = _evaluate_condition_expression(expression, last_output)
    return {
        "expression": expression,
        "result": result,
        "last_output": _to_json(last_output),
    }


def _execute_output_node(node: WorkflowNode, last_output: object) -> dict[str, Any]:
    output_format = str((node.config or {}).get("outputFormat", "text")).strip().lower() or "text"
    if output_format == "text":
        result = _stringify(last_output)
    else:
        result = _to_json(last_output)
    return {
        "format": output_format,
        "result": result,
    }


def _execute_tool_node(
    db: Session,
    node: WorkflowNode,
    run_input: dict[str, Any],
    last_output: object,
    step_outputs: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    tool_name = str((node.config or {}).get("toolName", "")).strip()
    if not tool_name:
        raise ValueError("Tool node is missing toolName.")

    raw_tool_params = (node.config or {}).get("toolParams", {})
    if raw_tool_params is None:
        raw_tool_params = {}
    if not isinstance(raw_tool_params, dict):
        raise ValueError("Tool node toolParams must be an object.")

    tool_context = _node_runtime_context(run_input, last_output, step_outputs, node.id)
    resolved_params = _resolve_templates(raw_tool_params, tool_context)
    if not isinstance(resolved_params, dict):
        raise ValueError("Resolved tool params must be an object.")

    output = invoke_tool_by_name(db, tool_name=tool_name, params=resolved_params, context=tool_context)
    return output, resolved_params


def _execute_memory_read_node(
    db: Session,
    node: WorkflowNode,
    workflow: Workflow,
    run: WorkflowRun,
    run_input: dict[str, Any],
    last_output: object,
    step_outputs: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    config = node.config or {}
    context = _node_runtime_context(run_input, last_output, step_outputs, node.id)
    scope = normalize_memory_scope(config.get("memoryScope", "workflow"))
    memory_key = _require_memory_key(config.get("memoryKey"), context)

    entry = read_memory_entry(
        db,
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        run_id=run.id,
        scope=scope,
        memory_key=memory_key,
    )

    has_fallback = "fallbackValue" in config
    fallback_value = _resolve_templates(config.get("fallbackValue"), context) if has_fallback else None
    value = entry.value_json if entry is not None else fallback_value

    output = {
        "operation": "memory_read",
        "scope": scope,
        "memory_key": memory_key,
        "found": entry is not None,
        "from_fallback": entry is None and has_fallback,
        "value": _to_json(value),
        "result": _to_json(value),
    }
    return output, {"memory_scope": scope, "memory_key": memory_key}


def _execute_memory_write_node(
    db: Session,
    node: WorkflowNode,
    workflow: Workflow,
    run: WorkflowRun,
    run_input: dict[str, Any],
    last_output: object,
    step_outputs: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    config = node.config or {}
    context = _node_runtime_context(run_input, last_output, step_outputs, node.id)
    scope = normalize_memory_scope(config.get("memoryScope", "workflow"))
    memory_key = _require_memory_key(config.get("memoryKey"), context)

    raw_value = config.get("valueTemplate", config.get("value", "{{last_output}}"))
    resolved_value = _resolve_templates(raw_value, context)

    entry = write_memory_entry(
        db,
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        run_id=run.id,
        scope=scope,
        memory_key=memory_key,
        value=_to_json(resolved_value),
    )

    output = {
        "operation": "memory_write",
        "scope": scope,
        "memory_key": memory_key,
        "stored": True,
        "value": _to_json(entry.value_json),
        "result": _to_json(entry.value_json),
    }
    metadata = {
        "memory_scope": scope,
        "memory_key": memory_key,
        "resolved_value": _to_json(resolved_value),
    }
    return output, metadata


def _execute_validator_node(
    node: WorkflowNode,
    run_input: dict[str, Any],
    last_output: object,
    step_outputs: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], str | None]:
    config = node.config or {}
    target_path = str(config.get("targetPath", "last_output")).strip() or "last_output"
    context = _node_runtime_context(run_input, last_output, step_outputs, node.id)
    payload_to_validate = _resolve_context_path(context, target_path)

    required_fields_raw = config.get("requiredFields", [])
    schema_raw = config.get("schema", {})
    rules_raw = config.get("rules", [])

    required_fields = required_fields_raw if isinstance(required_fields_raw, list) else []
    schema = schema_raw if isinstance(schema_raw, dict) else {}
    rules = rules_raw if isinstance(rules_raw, list) else []

    validation = validate_payload(
        payload_to_validate,
        required_fields=required_fields,
        schema=schema,
        rules=rules,
    )

    fail_on_error = bool(config.get("failOnError", True))
    error_summary: str | None = None
    if not validation["valid"] and fail_on_error:
        error_summary = "Validation failed: " + "; ".join(validation["errors"][:6])

    output = {
        "result": _to_json(payload_to_validate),
        "valid": bool(validation["valid"]),
        "validation": _to_json(validation),
    }
    metadata = {
        "target_path": target_path,
        "fail_on_error": fail_on_error,
    }
    return output, metadata, error_summary


def _next_node_for_non_condition(graph: ExecutionGraph, node_id: UUID) -> UUID | None:
    outgoing = graph.outgoing_edges[node_id]
    if not outgoing:
        return None
    return outgoing[0].target_node_id


def _next_node_for_condition(graph: ExecutionGraph, node_id: UUID, condition_result: bool) -> UUID:
    expected_handle = CONDITION_TRUE_HANDLE if condition_result else CONDITION_FALSE_HANDLE
    for edge in graph.outgoing_edges[node_id]:
        if (edge.source_handle or "").strip().lower() == expected_handle:
            return edge.target_node_id
    raise ValueError(f"Condition branch '{expected_handle}' is not connected.")


def _extract_run_input_from_steps(steps: list[WorkflowRunStep]) -> dict[str, Any]:
    if not steps:
        return {}

    first_input = steps[0].input_payload
    if isinstance(first_input, dict):
        candidate = first_input.get("run_input")
        if isinstance(candidate, dict):
            return _to_json(candidate)
    return {}


def _build_retry_state(steps: list[WorkflowRunStep], retry_step_index: int) -> tuple[object, dict[str, Any]]:
    previous_steps = [
        step for step in sorted(steps, key=lambda item: item.step_index) if step.step_index < retry_step_index
    ]
    last_output: object = None
    step_outputs: dict[str, Any] = {}

    for step in previous_steps:
        if step.status != STEP_STATUS_COMPLETED:
            continue
        output = _to_json(step.output_payload)
        step_outputs[str(step.node_id)] = output
        last_output = output

    return last_output, step_outputs


def _run_execution(
    db: Session,
    workflow: Workflow,
    user_id: UUID,
    *,
    run_input: dict[str, Any] | None = None,
    start_node_id: UUID | None = None,
    initial_last_output: object = None,
    initial_step_outputs: dict[str, Any] | None = None,
    retry_context: dict[str, Any] | None = None,
) -> WorkflowRun:
    safe_run_input = run_input or {}

    run = WorkflowRun(
        workflow_id=workflow.id,
        triggered_by_user_id=user_id,
        status=RUN_STATUS_QUEUED,
    )
    db.add(run)
    db.flush()

    run.status = RUN_STATUS_RUNNING
    run.started_at = _utcnow()

    state: dict[str, Any] = {
        "run_input": _to_json(safe_run_input),
        "last_output": _to_json(initial_last_output),
        "step_outputs": _to_json(initial_step_outputs or {}),
    }

    final_result: Any = None

    try:
        graph = validate_workflow_for_execution(workflow)
        current_node_id: UUID | None = start_node_id or graph.start_node_id
        if current_node_id not in graph.nodes_by_id:
            raise ValueError("Selected retry step does not belong to the workflow graph.")

        step_index = 1
        safety_limit = max(len(graph.nodes_by_id) * 3, 5)

        while current_node_id is not None:
            if step_index > safety_limit:
                raise ValueError("Execution exceeded safety limit. Check graph for unexpected loops.")

            node = graph.nodes_by_id[current_node_id]
            step_input: dict[str, Any] = {
                "run_input": state["run_input"],
                "last_output": state["last_output"],
                "step_outputs": state["step_outputs"],
            }
            if retry_context and step_index == 1:
                step_input["retry_context"] = retry_context

            step = WorkflowRunStep(
                run_id=run.id,
                step_index=step_index,
                node_id=node.id,
                node_type=node.node_type,
                node_label=node.label,
                status=STEP_STATUS_RUNNING,
                input_payload=_to_json(step_input),
                started_at=_utcnow(),
            )
            db.add(step)
            db.flush()

            try:
                if node.node_type == "prompt":
                    node_output = _execute_prompt_node(node, run_input=safe_run_input, last_output=state["last_output"])
                    next_node_id = _next_node_for_non_condition(graph, node.id)

                elif node.node_type == "condition":
                    node_output = _execute_condition_node(node, last_output=state["last_output"])
                    condition_result = bool(node_output["result"])
                    next_node_id = _next_node_for_condition(graph, node.id, condition_result)

                elif node.node_type == "tool":
                    step_outputs_for_context = dict(state["step_outputs"])
                    node_output, resolved_params = _execute_tool_node(
                        db,
                        node=node,
                        run_input=safe_run_input,
                        last_output=state["last_output"],
                        step_outputs=step_outputs_for_context,
                    )
                    step.input_payload = _to_json(
                        {
                            **step_input,
                            "tool_name": (node.config or {}).get("toolName"),
                            "resolved_tool_params": resolved_params,
                        }
                    )
                    next_node_id = _next_node_for_non_condition(graph, node.id)

                elif node.node_type == "memory_read":
                    step_outputs_for_context = dict(state["step_outputs"])
                    node_output, memory_meta = _execute_memory_read_node(
                        db,
                        node=node,
                        workflow=workflow,
                        run=run,
                        run_input=safe_run_input,
                        last_output=state["last_output"],
                        step_outputs=step_outputs_for_context,
                    )
                    step.input_payload = _to_json({**step_input, **memory_meta})
                    next_node_id = _next_node_for_non_condition(graph, node.id)

                elif node.node_type == "memory_write":
                    step_outputs_for_context = dict(state["step_outputs"])
                    node_output, memory_meta = _execute_memory_write_node(
                        db,
                        node=node,
                        workflow=workflow,
                        run=run,
                        run_input=safe_run_input,
                        last_output=state["last_output"],
                        step_outputs=step_outputs_for_context,
                    )
                    step.input_payload = _to_json({**step_input, **memory_meta})
                    next_node_id = _next_node_for_non_condition(graph, node.id)

                elif node.node_type == "validator":
                    step_outputs_for_context = dict(state["step_outputs"])
                    node_output, validator_meta, validation_error = _execute_validator_node(
                        node=node,
                        run_input=safe_run_input,
                        last_output=state["last_output"],
                        step_outputs=step_outputs_for_context,
                    )
                    step.input_payload = _to_json({**step_input, **validator_meta})
                    step.output_payload = _to_json(node_output)
                    if validation_error:
                        raise ValueError(validation_error)
                    next_node_id = _next_node_for_non_condition(graph, node.id)

                elif node.node_type == "output":
                    node_output = _execute_output_node(node, last_output=state["last_output"])
                    next_node_id = None

                else:
                    raise ValueError(f"Unsupported node type '{node.node_type}'.")

                if step.output_payload is None:
                    step.output_payload = _to_json(node_output)
                step.status = STEP_STATUS_COMPLETED
                step.completed_at = _utcnow()

                step_output_json = _to_json(step.output_payload)
                state["last_output"] = step_output_json
                step_outputs = dict(state["step_outputs"])
                step_outputs[str(node.id)] = step_output_json
                state["step_outputs"] = step_outputs

                if node.node_type == "output":
                    final_result = step_output_json
                    break

                current_node_id = next_node_id
                step_index += 1

            except Exception as step_error:
                if step.output_payload is None:
                    step.output_payload = _to_json({"error": str(step_error)})
                step.status = STEP_STATUS_FAILED
                step.error_message = str(step_error)
                step.completed_at = _utcnow()
                run.status = RUN_STATUS_FAILED
                run.error_message = f"Node '{node.label}' failed: {step_error}"
                break

        if run.status != RUN_STATUS_FAILED:
            if final_result is None:
                raise ValueError("Execution finished without reaching an output node.")
            run.status = RUN_STATUS_COMPLETED
            run.result_payload = _to_json(final_result)

    except Exception as execution_error:
        run.status = RUN_STATUS_FAILED
        if not run.error_message:
            run.error_message = str(execution_error)

    run.completed_at = _utcnow()
    db.commit()

    detailed_run = get_workflow_run_for_user(db, run.id, user_id, with_steps=True)
    if detailed_run is None:
        raise ValueError("Unable to load workflow run after execution.")
    return detailed_run


def execute_workflow_run(
    db: Session,
    workflow: Workflow,
    user_id: UUID,
    input_payload: dict | None = None,
) -> WorkflowRun:
    return _run_execution(
        db,
        workflow=workflow,
        user_id=user_id,
        run_input=(input_payload or {}),
    )


def retry_workflow_run_step(
    db: Session,
    source_run: WorkflowRun,
    retry_step: WorkflowRunStep,
    workflow: Workflow,
    *,
    user_id: UUID,
    input_payload: dict[str, Any] | None = None,
) -> WorkflowRun:
    if retry_step.status != STEP_STATUS_FAILED:
        raise ValueError("Only failed steps can be retried.")
    if source_run.status != RUN_STATUS_FAILED:
        raise ValueError("Step retry is only supported for failed runs.")

    run_input = input_payload if input_payload is not None else _extract_run_input_from_steps(source_run.steps)
    previous_last_output, previous_step_outputs = _build_retry_state(source_run.steps, retry_step.step_index)

    retry_context = {
        "source_run_id": str(source_run.id),
        "source_step_id": str(retry_step.id),
        "source_step_index": retry_step.step_index,
    }

    return _run_execution(
        db,
        workflow=workflow,
        user_id=user_id,
        run_input=run_input,
        start_node_id=retry_step.node_id,
        initial_last_output=previous_last_output,
        initial_step_outputs=previous_step_outputs,
        retry_context=retry_context,
    )


def list_workflow_runs_for_user(db: Session, workflow_id: UUID, user_id: UUID) -> list[WorkflowRun]:
    stmt = (
        select(WorkflowRun)
        .join(Workflow, Workflow.id == WorkflowRun.workflow_id)
        .join(Project, Project.id == Workflow.project_id)
        .where(WorkflowRun.workflow_id == workflow_id, Project.user_id == user_id)
        .order_by(WorkflowRun.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def get_workflow_run_for_user(
    db: Session,
    run_id: UUID,
    user_id: UUID,
    with_steps: bool = True,
) -> WorkflowRun | None:
    stmt = (
        select(WorkflowRun)
        .join(Workflow, Workflow.id == WorkflowRun.workflow_id)
        .join(Project, Project.id == Workflow.project_id)
        .where(WorkflowRun.id == run_id, Project.user_id == user_id)
    )

    if with_steps:
        stmt = stmt.options(selectinload(WorkflowRun.steps))

    return db.scalar(stmt)


def get_workflow_for_run_for_user(db: Session, workflow_id: UUID, user_id: UUID) -> Workflow | None:
    stmt = (
        select(Workflow)
        .join(Project, Project.id == Workflow.project_id)
        .where(Workflow.id == workflow_id, Project.user_id == user_id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return db.scalar(stmt)
