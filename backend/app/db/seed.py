import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal
from app.models.audit import AuditLog
from app.models.collaboration import ProjectMembership
from app.models.memory import WorkflowMemoryEntry
from app.models.project import Project
from app.models.run import WorkflowRun, WorkflowRunStep
from app.models.tool_data import ToolDocument, ToolMemoryEntry, ToolTemplate
from app.models.user import User
from app.models.versioning import Tag, WorkflowTag, WorkflowVersion
from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode
from app.services.auth_service import ensure_default_user


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_json(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))


def _seed_tool_data(db: Session) -> None:
    template_rows = [
        (
            "default_support",
            "Classify this support request and produce a concise result.",
            "Default support-classification template",
        ),
        (
            "billing_followup",
            "Summarize this billing issue and propose next steps.",
            "Billing follow-up template",
        ),
        (
            "ops_digest",
            "Summarize operations updates for daily standup.",
            "Operations status summary template",
        ),
    ]

    for template_key, content, description in template_rows:
        existing = db.scalar(select(ToolTemplate).where(ToolTemplate.template_key == template_key))
        if existing is None:
            db.add(ToolTemplate(template_key=template_key, content=content, description=description))

    document_rows = [
        (
            "billing_policy",
            "Billing Policy",
            "Refunds are available within 30 days. Proration is applied to subscription upgrades.",
            {"category": "billing"},
        ),
        (
            "shipping_policy",
            "Shipping Policy",
            "Standard shipping takes 3-5 business days. Expedited shipping takes 1-2 business days.",
            {"category": "operations"},
        ),
        (
            "sla_matrix",
            "SLA Matrix",
            "P1 response in 15 minutes, P2 in 1 hour, P3 in 4 hours.",
            {"category": "support"},
        ),
    ]

    for document_key, title, content, metadata_json in document_rows:
        existing = db.scalar(select(ToolDocument).where(ToolDocument.document_key == document_key))
        if existing is None:
            db.add(
                ToolDocument(
                    document_key=document_key,
                    title=title,
                    content=content,
                    metadata_json=metadata_json,
                )
            )

    tool_memory = db.get(ToolMemoryEntry, "seed:last_customer_tier")
    if tool_memory is None:
        db.add(
            ToolMemoryEntry(
                memory_key="seed:last_customer_tier",
                value_json={"customer_id": "cust-001", "tier": "enterprise"},
            )
        )
    else:
        tool_memory.value_json = {"customer_id": "cust-001", "tier": "enterprise"}


def _get_or_create_user(db: Session, *, email: str, display_name: str) -> User:
    normalized_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is not None:
        if user.display_name != display_name:
            user.display_name = display_name
        return user

    user = User(email=normalized_email, display_name=display_name)
    db.add(user)
    db.flush()
    return user


def _ensure_membership(
    db: Session,
    *,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
    added_by_user_id: uuid.UUID,
) -> ProjectMembership:
    membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    )
    if membership is None:
        membership = ProjectMembership(
            project_id=project_id,
            user_id=user_id,
            role=role,
            added_by_user_id=added_by_user_id,
        )
        db.add(membership)
        db.flush()
        return membership

    membership.role = role
    membership.added_by_user_id = added_by_user_id
    return membership


def _get_or_create_project(
    db: Session,
    *,
    owner_user_id: uuid.UUID,
    name: str,
    description: str,
) -> Project:
    project = db.scalar(select(Project).where(Project.user_id == owner_user_id, Project.name == name))
    if project is not None:
        return project

    project = Project(user_id=owner_user_id, name=name, description=description)
    db.add(project)
    db.flush()
    _ensure_membership(
        db,
        project_id=project.id,
        user_id=owner_user_id,
        role="owner",
        added_by_user_id=owner_user_id,
    )
    return project


def _load_workflow(db: Session, workflow_id: uuid.UUID) -> Workflow:
    workflow = db.scalar(
        select(Workflow)
        .where(Workflow.id == workflow_id)
        .options(
            selectinload(Workflow.nodes),
            selectinload(Workflow.edges),
            selectinload(Workflow.tag_links).selectinload(WorkflowTag.tag),
        )
    )
    if workflow is None:
        raise ValueError(f"Workflow {workflow_id} could not be loaded.")
    return workflow


def _get_or_create_workflow(
    db: Session,
    *,
    project_id: uuid.UUID,
    name: str,
    description: str,
    node_specs: list[dict[str, Any]],
    edge_specs: list[dict[str, Any]],
) -> Workflow:
    existing = db.scalar(select(Workflow).where(Workflow.project_id == project_id, Workflow.name == name))
    if existing is not None:
        return _load_workflow(db, existing.id)

    workflow = Workflow(project_id=project_id, name=name, description=description)
    db.add(workflow)
    db.flush()

    node_id_by_label: dict[str, uuid.UUID] = {}
    for spec in node_specs:
        node_id = uuid.uuid4()
        node_id_by_label[str(spec["label"])] = node_id
        db.add(
            WorkflowNode(
                id=node_id,
                workflow_id=workflow.id,
                node_type=str(spec["node_type"]),
                label=str(spec["label"]),
                position_x=float(spec["position_x"]),
                position_y=float(spec["position_y"]),
                config=_to_json(spec.get("config", {})),
            )
        )

    db.flush()

    for spec in edge_specs:
        db.add(
            WorkflowEdge(
                id=uuid.uuid4(),
                workflow_id=workflow.id,
                source_node_id=node_id_by_label[str(spec["source_label"])],
                target_node_id=node_id_by_label[str(spec["target_label"])],
                source_handle=spec.get("source_handle"),
                target_handle=spec.get("target_handle"),
                label=spec.get("label"),
                data=_to_json(spec.get("data")),
            )
        )

    db.flush()
    return _load_workflow(db, workflow.id)


def _ensure_tags(db: Session, *, workflow: Workflow, tags: list[str]) -> None:
    normalized = []
    seen: set[str] = set()
    for tag in tags:
        value = tag.strip().lower()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)

    existing_names = {link.tag.name for link in workflow.tag_links if link.tag}
    for tag_name in normalized:
        if tag_name in existing_names:
            continue
        tag = db.scalar(select(Tag).where(Tag.name == tag_name))
        if tag is None:
            tag = Tag(name=tag_name)
            db.add(tag)
            db.flush()
        db.add(WorkflowTag(workflow_id=workflow.id, tag_id=tag.id))
    db.flush()


def _snapshot_workflow(workflow: Workflow) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    nodes = sorted(
        workflow.nodes,
        key=lambda node: ((node.created_at.isoformat() if node.created_at else ""), str(node.id)),
    )
    edges = sorted(
        workflow.edges,
        key=lambda edge: ((edge.created_at.isoformat() if edge.created_at else ""), str(edge.id)),
    )
    tags = sorted({link.tag.name for link in workflow.tag_links if link.tag})

    node_snapshot = [
        {
            "id": str(node.id),
            "node_type": node.node_type,
            "label": node.label,
            "position_x": node.position_x,
            "position_y": node.position_y,
            "config": _to_json(node.config or {}),
        }
        for node in nodes
    ]
    edge_snapshot = [
        {
            "id": str(edge.id),
            "source_node_id": str(edge.source_node_id),
            "target_node_id": str(edge.target_node_id),
            "source_handle": edge.source_handle,
            "target_handle": edge.target_handle,
            "label": edge.label,
            "data": _to_json(edge.data),
        }
        for edge in edges
    ]
    return node_snapshot, edge_snapshot, tags


def _ensure_workflow_version(
    db: Session,
    *,
    workflow: Workflow,
    published_by_user_id: uuid.UUID,
    publish_note: str,
) -> WorkflowVersion:
    existing = db.scalar(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == workflow.id)
        .order_by(WorkflowVersion.version_number.desc())
    )
    if existing is not None:
        return existing

    nodes_snapshot, edges_snapshot, tags_snapshot = _snapshot_workflow(workflow)
    version = WorkflowVersion(
        workflow_id=workflow.id,
        version_number=1,
        name=workflow.name,
        description=workflow.description,
        nodes_snapshot=nodes_snapshot,
        edges_snapshot=edges_snapshot,
        tags_snapshot=tags_snapshot,
        published_by_user_id=published_by_user_id,
        publish_note=publish_note,
    )
    db.add(version)
    db.flush()
    return version


def _ensure_audit_log(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None,
    project_id: uuid.UUID | None = None,
    workflow_id: uuid.UUID | None = None,
    run_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    existing = db.scalar(
        select(AuditLog).where(
            AuditLog.action == action,
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id,
        )
    )
    if existing is not None:
        return

    db.add(
        AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            project_id=project_id,
            workflow_id=workflow_id,
            run_id=run_id,
            user_id=user_id,
            metadata_json=_to_json(metadata) if metadata else None,
        )
    )


def _ensure_workflow_memory_entry(
    db: Session,
    *,
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    scope: str,
    memory_key: str,
    value_json: Any,
    run_id: uuid.UUID | None = None,
) -> WorkflowMemoryEntry:
    existing = db.scalar(
        select(WorkflowMemoryEntry).where(
            WorkflowMemoryEntry.project_id == project_id,
            WorkflowMemoryEntry.workflow_id == workflow_id,
            WorkflowMemoryEntry.scope == scope,
            WorkflowMemoryEntry.memory_key == memory_key,
        )
    )
    if existing is None:
        existing = WorkflowMemoryEntry(
            project_id=project_id,
            workflow_id=workflow_id,
            run_id=run_id,
            scope=scope,
            memory_key=memory_key,
            value_json=_to_json(value_json),
        )
        db.add(existing)
        db.flush()
        return existing

    existing.run_id = run_id
    existing.value_json = _to_json(value_json)
    return existing


def _node_map(workflow: Workflow) -> dict[str, WorkflowNode]:
    return {node.label: node for node in workflow.nodes}


def _ensure_seed_run(
    db: Session,
    *,
    workflow: Workflow,
    user_id: uuid.UUID,
    seed_marker: str,
    status: str,
    input_payload: dict[str, Any],
    result_payload: Any,
    error_message: str | None,
    started_at: datetime,
    completed_at: datetime | None,
    steps: list[dict[str, Any]],
) -> WorkflowRun:
    existing = db.scalar(
        select(WorkflowRun).where(
            WorkflowRun.workflow_id == workflow.id,
            WorkflowRun.retry_reason == seed_marker,
        )
    )
    if existing is not None:
        return existing

    run = WorkflowRun(
        workflow_id=workflow.id,
        triggered_by_user_id=user_id,
        status=status,
        error_message=error_message,
        input_payload=_to_json(input_payload),
        execution_options={},
        celery_task_id=f"seed-{seed_marker}",
        queue_name="workflow_runs",
        worker_name="seed-worker",
        timeout_seconds=300,
        retry_count=0,
        retry_reason=seed_marker,
        token_budget=8000,
        token_used=0,
        context_budget=32000,
        context_used=0,
        result_payload=_to_json(result_payload) if result_payload is not None else None,
        started_at=started_at,
        completed_at=completed_at,
        created_at=started_at,
    )
    db.add(run)
    db.flush()

    node_lookup = _node_map(workflow)
    total_tokens = 0
    total_context = 0

    for step_spec in steps:
        node = node_lookup[str(step_spec["node_label"])]
        token_used = int(step_spec.get("token_used", 0))
        context_used = int(step_spec.get("context_used", 0))
        total_tokens += token_used
        total_context += context_used

        step = WorkflowRunStep(
            run_id=run.id,
            step_index=int(step_spec["step_index"]),
            node_id=node.id,
            node_type=node.node_type,
            node_label=node.label,
            status=str(step_spec["status"]),
            input_payload=_to_json(step_spec.get("input_payload")),
            output_payload=_to_json(step_spec.get("output_payload")),
            error_message=step_spec.get("error_message"),
            retry_count=0,
            retry_reason=seed_marker,
            token_used=token_used,
            context_used=context_used,
            started_at=step_spec.get("started_at"),
            completed_at=step_spec.get("completed_at"),
            created_at=step_spec.get("started_at") or started_at,
        )
        db.add(step)
        db.flush()

        if node.node_type == "tool" and step.status == "completed":
            _ensure_audit_log(
                db,
                action="tool.executed",
                entity_type="workflow_run_step",
                entity_id=str(step.id),
                project_id=workflow.project_id,
                workflow_id=workflow.id,
                run_id=run.id,
                user_id=user_id,
                metadata={"node_label": node.label, "tool_name": (node.config or {}).get("toolName")},
            )

    run.token_used = total_tokens
    run.context_used = total_context

    _ensure_audit_log(
        db,
        action="run.started",
        entity_type="workflow_run",
        entity_id=str(run.id),
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        run_id=run.id,
        user_id=user_id,
        metadata={"status": run.status, "seed_marker": seed_marker},
    )
    return run


def seed_sample_data() -> None:
    db = SessionLocal()
    try:
        owner_user = ensure_default_user(db)
        editor_user = _get_or_create_user(
            db,
            email="editor@promptworkflow.local",
            display_name="Demo Editor",
        )
        viewer_user = _get_or_create_user(
            db,
            email="viewer@promptworkflow.local",
            display_name="Demo Viewer",
        )

        _seed_tool_data(db)

        support_project = _get_or_create_project(
            db,
            owner_user_id=owner_user.id,
            name="Sample Support Project",
            description="Seeded project for end-to-end workflow demos.",
        )
        _ensure_membership(
            db,
            project_id=support_project.id,
            user_id=editor_user.id,
            role="editor",
            added_by_user_id=owner_user.id,
        )
        _ensure_membership(
            db,
            project_id=support_project.id,
            user_id=viewer_user.id,
            role="viewer",
            added_by_user_id=owner_user.id,
        )

        triage_workflow = _get_or_create_workflow(
            db,
            project_id=support_project.id,
            name="Seeded Support Triage",
            description="Prompt -> Condition branching into billing or general output.",
            node_specs=[
                {
                    "node_type": "prompt",
                    "label": "Prompt Intake",
                    "position_x": 120,
                    "position_y": 160,
                    "config": {"promptTemplate": "Classify ticket and intent: {{input}}"},
                },
                {
                    "node_type": "condition",
                    "label": "Billing Route?",
                    "position_x": 420,
                    "position_y": 160,
                    "config": {"conditionExpression": "contains:billing"},
                },
                {
                    "node_type": "output",
                    "label": "Output Billing",
                    "position_x": 760,
                    "position_y": 80,
                    "config": {"outputFormat": "json"},
                },
                {
                    "node_type": "output",
                    "label": "Output General",
                    "position_x": 760,
                    "position_y": 250,
                    "config": {"outputFormat": "json"},
                },
            ],
            edge_specs=[
                {"source_label": "Prompt Intake", "target_label": "Billing Route?"},
                {"source_label": "Billing Route?", "target_label": "Output Billing", "source_handle": "true"},
                {"source_label": "Billing Route?", "target_label": "Output General", "source_handle": "false"},
            ],
        )
        _ensure_tags(db, workflow=triage_workflow, tags=["support", "triage", "condition"])
        _ensure_workflow_version(
            db,
            workflow=triage_workflow,
            published_by_user_id=owner_user.id,
            publish_note="Seeded baseline version for triage workflow.",
        )

        tool_workflow = _get_or_create_workflow(
            db,
            project_id=support_project.id,
            name="Seeded Tool + Memory + Validator",
            description="Prompt -> Tool -> Memory Write -> Memory Read -> Validator -> Output.",
            node_specs=[
                {
                    "node_type": "prompt",
                    "label": "Prompt Context",
                    "position_x": 80,
                    "position_y": 150,
                    "config": {"promptTemplate": "Summarize request and provide machine-readable result."},
                },
                {
                    "node_type": "tool",
                    "label": "Lookup Template",
                    "position_x": 320,
                    "position_y": 150,
                    "config": {"toolName": "template_fetch", "toolParams": {"template_key": "default_support"}},
                },
                {
                    "node_type": "memory_write",
                    "label": "Write Summary",
                    "position_x": 560,
                    "position_y": 150,
                    "config": {"memoryScope": "workflow", "memoryKey": "latest_summary", "valueTemplate": "{{last_output}}"},
                },
                {
                    "node_type": "memory_read",
                    "label": "Read Summary",
                    "position_x": 800,
                    "position_y": 150,
                    "config": {
                        "memoryScope": "workflow",
                        "memoryKey": "latest_summary",
                        "fallbackValue": {"result": "missing"},
                    },
                },
                {
                    "node_type": "validator",
                    "label": "Validate Summary",
                    "position_x": 1040,
                    "position_y": 150,
                    "config": {
                        "targetPath": "last_output",
                        "requiredFields": ["result"],
                        "schema": {"required": ["result"], "properties": {"result": "string"}},
                        "rules": [{"type": "non-empty", "path": "result"}],
                        "failOnError": True,
                    },
                },
                {
                    "node_type": "output",
                    "label": "Final Output",
                    "position_x": 1280,
                    "position_y": 150,
                    "config": {"outputFormat": "json"},
                },
            ],
            edge_specs=[
                {"source_label": "Prompt Context", "target_label": "Lookup Template"},
                {"source_label": "Lookup Template", "target_label": "Write Summary"},
                {"source_label": "Write Summary", "target_label": "Read Summary"},
                {"source_label": "Read Summary", "target_label": "Validate Summary"},
                {"source_label": "Validate Summary", "target_label": "Final Output"},
            ],
        )
        _ensure_tags(db, workflow=tool_workflow, tags=["tools", "memory", "validator"])
        _ensure_workflow_version(
            db,
            workflow=tool_workflow,
            published_by_user_id=owner_user.id,
            publish_note="Seeded baseline version for tool-memory-validator workflow.",
        )

        ops_project = _get_or_create_project(
            db,
            owner_user_id=owner_user.id,
            name="Sample Ops Project",
            description="Second seeded project to populate dashboard analytics.",
        )
        _ensure_membership(
            db,
            project_id=ops_project.id,
            user_id=editor_user.id,
            role="editor",
            added_by_user_id=owner_user.id,
        )

        ops_workflow = _get_or_create_workflow(
            db,
            project_id=ops_project.id,
            name="Seeded Ops Digest",
            description="Simple prompt-output flow for operations digesting.",
            node_specs=[
                {
                    "node_type": "prompt",
                    "label": "Prompt Digest",
                    "position_x": 140,
                    "position_y": 120,
                    "config": {"promptTemplate": "Generate concise operations digest."},
                },
                {
                    "node_type": "output",
                    "label": "Output Digest",
                    "position_x": 460,
                    "position_y": 120,
                    "config": {"outputFormat": "text"},
                },
            ],
            edge_specs=[{"source_label": "Prompt Digest", "target_label": "Output Digest"}],
        )
        _ensure_tags(db, workflow=ops_workflow, tags=["ops", "digest"])
        _ensure_workflow_version(
            db,
            workflow=ops_workflow,
            published_by_user_id=owner_user.id,
            publish_note="Seeded baseline version for ops workflow.",
        )

        now = _utcnow()

        triage_completed_start = now - timedelta(days=1, minutes=12)
        triage_completed_end = triage_completed_start + timedelta(seconds=7)
        triage_completed_run = _ensure_seed_run(
            db,
            workflow=triage_workflow,
            user_id=owner_user.id,
            seed_marker="seed:triage:completed",
            status="completed",
            input_payload={"ticket_id": "TCK-1001", "message": "Need billing refund for duplicated invoice."},
            result_payload={"format": "json", "result": {"route": "billing", "priority": "high"}},
            error_message=None,
            started_at=triage_completed_start,
            completed_at=triage_completed_end,
            steps=[
                {
                    "step_index": 1,
                    "node_label": "Prompt Intake",
                    "status": "completed",
                    "token_used": 88,
                    "context_used": 420,
                    "started_at": triage_completed_start,
                    "completed_at": triage_completed_start + timedelta(seconds=2),
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-1001", "message": "Need billing refund for duplicated invoice."},
                        "last_output": None,
                        "step_outputs": {},
                    },
                    "output_payload": {
                        "rendered_prompt": "Classify ticket and intent.",
                        "simulated_response": "billing_refund_intent",
                    },
                },
                {
                    "step_index": 2,
                    "node_label": "Billing Route?",
                    "status": "completed",
                    "token_used": 45,
                    "context_used": 260,
                    "started_at": triage_completed_start + timedelta(seconds=2),
                    "completed_at": triage_completed_start + timedelta(seconds=4),
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-1001", "message": "Need billing refund for duplicated invoice."},
                        "last_output": {"rendered_prompt": "Classify ticket and intent.", "simulated_response": "billing_refund_intent"},
                        "step_outputs": {},
                    },
                    "output_payload": {
                        "expression": "contains:billing",
                        "result": True,
                        "last_output": {"rendered_prompt": "Classify ticket and intent.", "simulated_response": "billing_refund_intent"},
                    },
                },
                {
                    "step_index": 3,
                    "node_label": "Output Billing",
                    "status": "completed",
                    "token_used": 33,
                    "context_used": 180,
                    "started_at": triage_completed_start + timedelta(seconds=4),
                    "completed_at": triage_completed_end,
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-1001", "message": "Need billing refund for duplicated invoice."},
                        "last_output": {"expression": "contains:billing", "result": True},
                        "step_outputs": {},
                    },
                    "output_payload": {"format": "json", "result": {"route": "billing", "priority": "high"}},
                },
            ],
        )

        _ensure_seed_run(
            db,
            workflow=triage_workflow,
            user_id=editor_user.id,
            seed_marker="seed:triage:failed",
            status="failed",
            input_payload={"ticket_id": "TCK-1002", "message": "Customer asks for timeline update."},
            result_payload=None,
            error_message="Node 'Billing Route?' failed: Unsupported condition expression.",
            started_at=now - timedelta(hours=8, minutes=30),
            completed_at=now - timedelta(hours=8, minutes=29, seconds=51),
            steps=[
                {
                    "step_index": 1,
                    "node_label": "Prompt Intake",
                    "status": "completed",
                    "token_used": 72,
                    "context_used": 360,
                    "started_at": now - timedelta(hours=8, minutes=30),
                    "completed_at": now - timedelta(hours=8, minutes=29, seconds=55),
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-1002", "message": "Customer asks for timeline update."},
                        "last_output": None,
                        "step_outputs": {},
                    },
                    "output_payload": {"rendered_prompt": "Classify ticket and intent.", "simulated_response": "general_support_intent"},
                },
                {
                    "step_index": 2,
                    "node_label": "Billing Route?",
                    "status": "failed",
                    "token_used": 25,
                    "context_used": 140,
                    "started_at": now - timedelta(hours=8, minutes=29, seconds=55),
                    "completed_at": now - timedelta(hours=8, minutes=29, seconds=51),
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-1002", "message": "Customer asks for timeline update."},
                        "last_output": {"rendered_prompt": "Classify ticket and intent.", "simulated_response": "general_support_intent"},
                        "step_outputs": {},
                    },
                    "output_payload": {"error": "Unsupported condition expression"},
                    "error_message": "Unsupported condition expression.",
                },
            ],
        )

        tool_completed_start = now - timedelta(hours=5, minutes=14)
        tool_completed_end = tool_completed_start + timedelta(seconds=11)
        tool_completed_run = _ensure_seed_run(
            db,
            workflow=tool_workflow,
            user_id=owner_user.id,
            seed_marker="seed:tool:completed",
            status="completed",
            input_payload={"ticket_id": "TCK-2001", "message": "Summarize this billing escalation."},
            result_payload={"format": "json", "result": {"result": "summarized output"}},
            error_message=None,
            started_at=tool_completed_start,
            completed_at=tool_completed_end,
            steps=[
                {
                    "step_index": 1,
                    "node_label": "Prompt Context",
                    "status": "completed",
                    "token_used": 60,
                    "context_used": 280,
                    "started_at": tool_completed_start,
                    "completed_at": tool_completed_start + timedelta(seconds=2),
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-2001", "message": "Summarize this billing escalation."},
                        "last_output": None,
                        "step_outputs": {},
                    },
                    "output_payload": {"rendered_prompt": "Summarize request.", "simulated_response": "request_summary"},
                },
                {
                    "step_index": 2,
                    "node_label": "Lookup Template",
                    "status": "completed",
                    "token_used": 84,
                    "context_used": 420,
                    "started_at": tool_completed_start + timedelta(seconds=2),
                    "completed_at": tool_completed_start + timedelta(seconds=4),
                    "input_payload": {
                        "run_input": {"ticket_id": "TCK-2001", "message": "Summarize this billing escalation."},
                        "last_output": {"rendered_prompt": "Summarize request.", "simulated_response": "request_summary"},
                        "step_outputs": {},
                        "tool_name": "template_fetch",
                        "resolved_tool_params": {"template_key": "default_support"},
                    },
                    "output_payload": {
                        "tool_name": "template_fetch",
                        "tool_title": "Template Fetch",
                        "params": {"template_key": "default_support"},
                        "result": {
                            "template_key": "default_support",
                            "content": "Classify this support request and produce a concise result.",
                        },
                    },
                },
                {
                    "step_index": 3,
                    "node_label": "Write Summary",
                    "status": "completed",
                    "token_used": 34,
                    "context_used": 210,
                    "started_at": tool_completed_start + timedelta(seconds=4),
                    "completed_at": tool_completed_start + timedelta(seconds=6),
                    "input_payload": {"memory_scope": "workflow", "memory_key": "latest_summary"},
                    "output_payload": {
                        "operation": "memory_write",
                        "scope": "workflow",
                        "memory_key": "latest_summary",
                        "stored": True,
                        "value": {"result": "summarized output"},
                        "result": {"result": "summarized output"},
                    },
                },
                {
                    "step_index": 4,
                    "node_label": "Read Summary",
                    "status": "completed",
                    "token_used": 24,
                    "context_used": 155,
                    "started_at": tool_completed_start + timedelta(seconds=6),
                    "completed_at": tool_completed_start + timedelta(seconds=7),
                    "input_payload": {"memory_scope": "workflow", "memory_key": "latest_summary"},
                    "output_payload": {
                        "operation": "memory_read",
                        "scope": "workflow",
                        "memory_key": "latest_summary",
                        "found": True,
                        "from_fallback": False,
                        "value": {"result": "summarized output"},
                        "result": {"result": "summarized output"},
                    },
                },
                {
                    "step_index": 5,
                    "node_label": "Validate Summary",
                    "status": "completed",
                    "token_used": 41,
                    "context_used": 230,
                    "started_at": tool_completed_start + timedelta(seconds=7),
                    "completed_at": tool_completed_start + timedelta(seconds=9),
                    "input_payload": {"target_path": "last_output", "fail_on_error": True},
                    "output_payload": {
                        "result": {"result": "summarized output"},
                        "valid": True,
                        "validation": {"valid": True, "errors": []},
                    },
                },
                {
                    "step_index": 6,
                    "node_label": "Final Output",
                    "status": "completed",
                    "token_used": 22,
                    "context_used": 120,
                    "started_at": tool_completed_start + timedelta(seconds=9),
                    "completed_at": tool_completed_end,
                    "input_payload": {"last_output": {"result": {"result": "summarized output"}, "valid": True}},
                    "output_payload": {"format": "json", "result": {"result": "summarized output"}},
                },
            ],
        )

        _ensure_seed_run(
            db,
            workflow=tool_workflow,
            user_id=editor_user.id,
            seed_marker="seed:tool:timed_out",
            status="timed_out",
            input_payload={"ticket_id": "TCK-2002", "message": "Run with strict timeout budget."},
            result_payload=None,
            error_message="Run exceeded timeout of 1 seconds.",
            started_at=now - timedelta(hours=2, minutes=5),
            completed_at=now - timedelta(hours=2, minutes=4, seconds=58),
            steps=[
                {
                    "step_index": 1,
                    "node_label": "Prompt Context",
                    "status": "timed_out",
                    "token_used": 5,
                    "context_used": 32,
                    "started_at": now - timedelta(hours=2, minutes=5),
                    "completed_at": now - timedelta(hours=2, minutes=4, seconds=58),
                    "input_payload": {"run_input": {"ticket_id": "TCK-2002"}},
                    "output_payload": {"error": "Run exceeded timeout of 1 seconds."},
                    "error_message": "Run exceeded timeout of 1 seconds.",
                }
            ],
        )

        _ensure_seed_run(
            db,
            workflow=ops_workflow,
            user_id=owner_user.id,
            seed_marker="seed:ops:cancelled",
            status="cancelled",
            input_payload={"report_date": "2026-03-21"},
            result_payload=None,
            error_message="Run was cancelled by user request.",
            started_at=now - timedelta(hours=1, minutes=20),
            completed_at=now - timedelta(hours=1, minutes=19, seconds=40),
            steps=[
                {
                    "step_index": 1,
                    "node_label": "Prompt Digest",
                    "status": "cancelled",
                    "token_used": 10,
                    "context_used": 60,
                    "started_at": now - timedelta(hours=1, minutes=20),
                    "completed_at": now - timedelta(hours=1, minutes=19, seconds=40),
                    "input_payload": {"run_input": {"report_date": "2026-03-21"}},
                    "output_payload": {"error": "Run was cancelled by user request."},
                    "error_message": "Run was cancelled by user request.",
                }
            ],
        )

        _ensure_workflow_memory_entry(
            db,
            project_id=support_project.id,
            workflow_id=tool_workflow.id,
            scope="workflow",
            memory_key="latest_summary",
            value_json={"result": "summarized output"},
            run_id=tool_completed_run.id,
        )
        _ensure_workflow_memory_entry(
            db,
            project_id=support_project.id,
            workflow_id=triage_workflow.id,
            scope="project",
            memory_key="default_priority",
            value_json={"priority": "medium"},
            run_id=triage_completed_run.id,
        )

        _ensure_audit_log(
            db,
            action="workflow.created",
            entity_type="workflow",
            entity_id=str(triage_workflow.id),
            project_id=support_project.id,
            workflow_id=triage_workflow.id,
            user_id=owner_user.id,
            metadata={"name": triage_workflow.name},
        )
        _ensure_audit_log(
            db,
            action="workflow.created",
            entity_type="workflow",
            entity_id=str(tool_workflow.id),
            project_id=support_project.id,
            workflow_id=tool_workflow.id,
            user_id=owner_user.id,
            metadata={"name": tool_workflow.name},
        )
        _ensure_audit_log(
            db,
            action="workflow.created",
            entity_type="workflow",
            entity_id=str(ops_workflow.id),
            project_id=ops_project.id,
            workflow_id=ops_workflow.id,
            user_id=owner_user.id,
            metadata={"name": ops_workflow.name},
        )

        db.commit()
        print("Seed complete:")
        print("- users: default + editor + viewer")
        print("- projects: Sample Support Project, Sample Ops Project")
        print("- workflows: 3 seeded workflows")
        print("- runs: completed/failed/timed_out/cancelled samples")
        print("- includes tags, versions, memory entries, tool data, and audit history")
    finally:
        db.close()


if __name__ == "__main__":
    seed_sample_data()
