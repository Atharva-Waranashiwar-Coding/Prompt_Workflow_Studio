from datetime import datetime, timezone
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.project import Project
from app.models.versioning import Tag, WorkflowTag, WorkflowVersion
from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode
from app.schemas.versioning import WorkflowDuplicateRequest
from app.schemas.workflow import WorkflowSaveRequest
from app.services.access_service import (
    ROLE_EDITOR,
    get_project_access,
    list_accessible_project_ids,
    require_project_access,
)
from app.services.audit_service import record_audit_log


def _workflow_load_options():
    return (
        selectinload(Workflow.nodes),
        selectinload(Workflow.edges),
        selectinload(Workflow.tag_links).selectinload(WorkflowTag.tag),
    )


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_json(value: Any) -> Any:
    import json

    return json.loads(json.dumps(value, default=str))


def _normalize_tags(raw_tags: list[str] | None) -> list[str]:
    if not raw_tags:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_tags:
        tag = str(raw).strip().lower()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag)
    return normalized


def _sync_workflow_tags(db: Session, workflow: Workflow, tags: list[str] | None) -> None:
    normalized_tags = _normalize_tags(tags)
    db.execute(delete(WorkflowTag).where(WorkflowTag.workflow_id == workflow.id))

    if not normalized_tags:
        db.flush()
        return

    existing_tags = {
        tag.name: tag
        for tag in db.scalars(select(Tag).where(Tag.name.in_(normalized_tags))).all()
    }

    for tag_name in normalized_tags:
        tag = existing_tags.get(tag_name)
        if tag is None:
            tag = Tag(name=tag_name)
            db.add(tag)
            db.flush()
            existing_tags[tag_name] = tag
        db.add(WorkflowTag(workflow_id=workflow.id, tag_id=tag.id))

    db.flush()


def _workflow_snapshot(workflow: Workflow) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    nodes_snapshot = [
        {
            "id": str(node.id),
            "node_type": node.node_type,
            "label": node.label,
            "position_x": node.position_x,
            "position_y": node.position_y,
            "config": _to_json(node.config or {}),
        }
        for node in workflow.nodes
    ]
    edges_snapshot = [
        {
            "id": str(edge.id),
            "source_node_id": str(edge.source_node_id),
            "target_node_id": str(edge.target_node_id),
            "source_handle": edge.source_handle,
            "target_handle": edge.target_handle,
            "label": edge.label,
            "data": _to_json(edge.data),
        }
        for edge in workflow.edges
    ]
    tags_snapshot = list(workflow.tags)
    return nodes_snapshot, edges_snapshot, tags_snapshot


def list_workflows(
    db: Session,
    project_id: UUID,
    *,
    query: str | None = None,
    tag: str | None = None,
    tool: str | None = None,
) -> list[Workflow]:
    stmt = (
        select(Workflow)
        .where(Workflow.project_id == project_id)
        .order_by(Workflow.updated_at.desc())
        .options(*_workflow_load_options())
    )
    if query and query.strip():
        pattern = f"%{query.strip()}%"
        stmt = stmt.where((Workflow.name.ilike(pattern)) | (Workflow.description.ilike(pattern)))

    if tag and tag.strip():
        tag_pattern = f"%{tag.strip().lower()}%"
        stmt = (
            stmt.join(WorkflowTag, WorkflowTag.workflow_id == Workflow.id)
            .join(Tag, Tag.id == WorkflowTag.tag_id)
            .where(Tag.name.ilike(tag_pattern))
        )

    if tool and tool.strip():
        tool_pattern = f"%{tool.strip()}%"
        stmt = stmt.join(WorkflowNode, WorkflowNode.workflow_id == Workflow.id).where(
            WorkflowNode.node_type == "tool",
            WorkflowNode.config["toolName"].astext.ilike(tool_pattern),
        )

    return list(db.scalars(stmt).unique().all())


def create_workflow(
    db: Session,
    *,
    project_id: UUID,
    name: str,
    description: str | None = None,
    tags: list[str] | None = None,
    user_id: UUID | None = None,
) -> Workflow:
    workflow = Workflow(project_id=project_id, name=name, description=description)
    db.add(workflow)
    db.flush()

    _sync_workflow_tags(db, workflow, tags)
    record_audit_log(
        db,
        action="workflow.created",
        entity_type="workflow",
        entity_id=str(workflow.id),
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        user_id=user_id,
        metadata={"name": workflow.name, "tags": _normalize_tags(tags)},
    )

    db.commit()
    reload_user_id = user_id
    if reload_user_id is None:
        owner_stmt = select(Project.user_id).where(Project.id == project_id)
        reload_user_id = db.scalar(owner_stmt)
    if reload_user_id is None:
        raise ValueError("Unable to determine workflow owner for reload.")

    reloaded = get_workflow_for_user(db, workflow_id=workflow.id, user_id=reload_user_id)
    if reloaded is None:
        raise ValueError("Workflow could not be loaded after creation.")
    return reloaded


def get_workflow_for_user(db: Session, workflow_id: UUID, user_id: UUID) -> Workflow | None:
    stmt = (
        select(Workflow)
        .where(Workflow.id == workflow_id)
        .options(*_workflow_load_options())
        .execution_options(populate_existing=True)
    )
    workflow = db.scalar(stmt)
    if workflow is None:
        return None

    access = get_project_access(db, project_id=workflow.project_id, user_id=user_id)
    if access is None:
        return None
    return workflow


def save_workflow_graph(
    db: Session,
    workflow: Workflow,
    payload: WorkflowSaveRequest,
    *,
    user_id: UUID | None = None,
) -> Workflow:
    node_ids = {node.id for node in payload.nodes}
    for edge in payload.edges:
        if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
            raise ValueError("Each edge must reference nodes in the workflow payload.")

    workflow.name = payload.name
    workflow.description = payload.description
    workflow.updated_at = _utcnow()

    db.execute(delete(WorkflowEdge).where(WorkflowEdge.workflow_id == workflow.id))
    db.execute(delete(WorkflowNode).where(WorkflowNode.workflow_id == workflow.id))

    for node in payload.nodes:
        db.add(
            WorkflowNode(
                id=node.id,
                workflow_id=workflow.id,
                node_type=node.node_type,
                label=node.label,
                position_x=node.position_x,
                position_y=node.position_y,
                config=node.config,
            )
        )
    db.flush()

    for edge in payload.edges:
        db.add(
            WorkflowEdge(
                id=edge.id,
                workflow_id=workflow.id,
                source_node_id=edge.source_node_id,
                target_node_id=edge.target_node_id,
                source_handle=edge.source_handle,
                target_handle=edge.target_handle,
                label=edge.label,
                data=edge.data,
            )
        )
    db.flush()

    _sync_workflow_tags(db, workflow, payload.tags)
    record_audit_log(
        db,
        action="workflow.updated",
        entity_type="workflow",
        entity_id=str(workflow.id),
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        user_id=user_id,
        metadata={"name": workflow.name, "tags": workflow.tags},
    )

    db.commit()
    owner_user_id = user_id or workflow.project.user_id
    refreshed = get_workflow_for_user(db, workflow.id, owner_user_id)
    if refreshed is None:
        raise ValueError("Workflow could not be reloaded after save.")
    return refreshed


def publish_workflow_version(
    db: Session,
    *,
    workflow: Workflow,
    user_id: UUID,
    note: str | None = None,
) -> WorkflowVersion:
    max_version_stmt = select(func.coalesce(func.max(WorkflowVersion.version_number), 0)).where(
        WorkflowVersion.workflow_id == workflow.id
    )
    next_version = int(db.scalar(max_version_stmt) or 0) + 1

    nodes_snapshot, edges_snapshot, tags_snapshot = _workflow_snapshot(workflow)

    version = WorkflowVersion(
        workflow_id=workflow.id,
        version_number=next_version,
        name=workflow.name,
        description=workflow.description,
        nodes_snapshot=nodes_snapshot,
        edges_snapshot=edges_snapshot,
        tags_snapshot=tags_snapshot,
        published_by_user_id=user_id,
        publish_note=note,
    )
    db.add(version)
    db.flush()
    record_audit_log(
        db,
        action="workflow.version_published",
        entity_type="workflow_version",
        entity_id=str(version.id),
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        user_id=user_id,
        metadata={
            "version_number": version.version_number,
            "publish_note": note,
        },
    )
    db.commit()
    db.refresh(version)
    return version


def list_workflow_versions(db: Session, *, workflow_id: UUID) -> list[WorkflowVersion]:
    stmt = (
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == workflow_id)
        .order_by(WorkflowVersion.version_number.desc())
    )
    return list(db.scalars(stmt).all())


def get_workflow_version(db: Session, *, workflow_id: UUID, version_id: UUID) -> WorkflowVersion | None:
    stmt = select(WorkflowVersion).where(
        WorkflowVersion.id == version_id,
        WorkflowVersion.workflow_id == workflow_id,
    )
    return db.scalar(stmt)


def _restore_snapshot_into_workflow(db: Session, *, workflow: Workflow, version: WorkflowVersion) -> None:
    node_ids: set[UUID] = set()
    parsed_nodes: list[WorkflowNode] = []
    for node_raw in version.nodes_snapshot:
        node_id = UUID(str(node_raw["id"]))
        node_ids.add(node_id)
        parsed_nodes.append(
            WorkflowNode(
                id=node_id,
                workflow_id=workflow.id,
                node_type=str(node_raw["node_type"]),
                label=str(node_raw["label"]),
                position_x=float(node_raw["position_x"]),
                position_y=float(node_raw["position_y"]),
                config=_to_json(node_raw.get("config") or {}),
            )
        )

    parsed_edges: list[WorkflowEdge] = []
    for edge_raw in version.edges_snapshot:
        source_node_id = UUID(str(edge_raw["source_node_id"]))
        target_node_id = UUID(str(edge_raw["target_node_id"]))
        if source_node_id not in node_ids or target_node_id not in node_ids:
            raise ValueError("Version snapshot has invalid edges referencing unknown nodes.")
        parsed_edges.append(
            WorkflowEdge(
                id=UUID(str(edge_raw["id"])),
                workflow_id=workflow.id,
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                source_handle=edge_raw.get("source_handle"),
                target_handle=edge_raw.get("target_handle"),
                label=edge_raw.get("label"),
                data=_to_json(edge_raw.get("data")),
            )
        )

    workflow.name = version.name
    workflow.description = version.description
    workflow.updated_at = _utcnow()

    db.execute(delete(WorkflowEdge).where(WorkflowEdge.workflow_id == workflow.id))
    db.execute(delete(WorkflowNode).where(WorkflowNode.workflow_id == workflow.id))
    for node in parsed_nodes:
        db.add(node)
    db.flush()
    for edge in parsed_edges:
        db.add(edge)
    db.flush()
    _sync_workflow_tags(db, workflow, version.tags_snapshot)


def restore_workflow_version(
    db: Session,
    *,
    workflow: Workflow,
    version: WorkflowVersion,
    user_id: UUID,
) -> Workflow:
    _restore_snapshot_into_workflow(db, workflow=workflow, version=version)
    record_audit_log(
        db,
        action="workflow.version_restored",
        entity_type="workflow",
        entity_id=str(workflow.id),
        project_id=workflow.project_id,
        workflow_id=workflow.id,
        user_id=user_id,
        metadata={
            "restored_from_version_id": str(version.id),
            "version_number": version.version_number,
        },
    )
    db.commit()
    refreshed = get_workflow_for_user(db, workflow.id, user_id=user_id)
    if refreshed is None:
        raise ValueError("Workflow could not be reloaded after restore.")
    return refreshed


def duplicate_workflow(
    db: Session,
    *,
    source_workflow: Workflow,
    payload: WorkflowDuplicateRequest,
    user_id: UUID,
) -> Workflow:
    target_project_id = payload.target_project_id or source_workflow.project_id
    require_project_access(db, project_id=target_project_id, user_id=user_id, minimum_role=ROLE_EDITOR)

    duplicate_name = (payload.name or f"{source_workflow.name} (Copy)").strip()
    if not duplicate_name:
        raise ValueError("Duplicate workflow must have a non-empty name.")

    duplicate = Workflow(
        project_id=target_project_id,
        name=duplicate_name,
        description=payload.description if payload.description is not None else source_workflow.description,
    )
    db.add(duplicate)
    db.flush()

    node_id_map: dict[UUID, UUID] = {}
    for source_node in source_workflow.nodes:
        new_node_id = uuid.uuid4()
        node_id_map[source_node.id] = new_node_id
        db.add(
            WorkflowNode(
                id=new_node_id,
                workflow_id=duplicate.id,
                node_type=source_node.node_type,
                label=source_node.label,
                position_x=source_node.position_x,
                position_y=source_node.position_y,
                config=_to_json(source_node.config or {}),
            )
        )
    db.flush()

    for source_edge in source_workflow.edges:
        db.add(
            WorkflowEdge(
                id=uuid.uuid4(),
                workflow_id=duplicate.id,
                source_node_id=node_id_map[source_edge.source_node_id],
                target_node_id=node_id_map[source_edge.target_node_id],
                source_handle=source_edge.source_handle,
                target_handle=source_edge.target_handle,
                label=source_edge.label,
                data=_to_json(source_edge.data),
            )
        )
    db.flush()

    _sync_workflow_tags(db, duplicate, source_workflow.tags)
    db.flush()

    duplicate_loaded = db.scalar(
        select(Workflow).where(Workflow.id == duplicate.id).options(*_workflow_load_options())
    )
    if duplicate_loaded is None:
        raise ValueError("Failed to load duplicated workflow.")

    max_version_stmt = select(func.coalesce(func.max(WorkflowVersion.version_number), 0)).where(
        WorkflowVersion.workflow_id == duplicate_loaded.id
    )
    next_version = int(db.scalar(max_version_stmt) or 0) + 1
    nodes_snapshot, edges_snapshot, tags_snapshot = _workflow_snapshot(duplicate_loaded)
    version = WorkflowVersion(
        workflow_id=duplicate_loaded.id,
        version_number=next_version,
        name=duplicate_loaded.name,
        description=duplicate_loaded.description,
        nodes_snapshot=nodes_snapshot,
        edges_snapshot=edges_snapshot,
        tags_snapshot=tags_snapshot,
        published_by_user_id=user_id,
        publish_note=payload.publish_note or "Auto-published from workflow duplication.",
    )
    db.add(version)
    db.flush()

    record_audit_log(
        db,
        action="workflow.duplicated",
        entity_type="workflow",
        entity_id=str(duplicate_loaded.id),
        project_id=duplicate_loaded.project_id,
        workflow_id=duplicate_loaded.id,
        user_id=user_id,
        metadata={
            "source_workflow_id": str(source_workflow.id),
            "auto_published_version_id": str(version.id),
        },
    )
    db.commit()

    refreshed = get_workflow_for_user(db, duplicate_loaded.id, user_id=user_id)
    if refreshed is None:
        raise ValueError("Duplicated workflow could not be loaded.")
    return refreshed


def search_workflows(
    db: Session,
    *,
    user_id: UUID,
    query: str | None = None,
    tag: str | None = None,
    tool: str | None = None,
    project_id: UUID | None = None,
) -> list[Workflow]:
    if project_id is not None:
        require_project_access(db, project_id=project_id, user_id=user_id)
        project_ids = [project_id]
    else:
        project_ids = list_accessible_project_ids(db, user_id=user_id)

    if not project_ids:
        return []

    stmt = (
        select(Workflow)
        .where(Workflow.project_id.in_(project_ids))
        .order_by(Workflow.updated_at.desc())
        .options(*_workflow_load_options())
    )
    if query and query.strip():
        pattern = f"%{query.strip()}%"
        stmt = stmt.where((Workflow.name.ilike(pattern)) | (Workflow.description.ilike(pattern)))
    if tag and tag.strip():
        tag_pattern = f"%{tag.strip().lower()}%"
        stmt = (
            stmt.join(WorkflowTag, WorkflowTag.workflow_id == Workflow.id)
            .join(Tag, Tag.id == WorkflowTag.tag_id)
            .where(Tag.name.ilike(tag_pattern))
        )
    if tool and tool.strip():
        tool_pattern = f"%{tool.strip()}%"
        stmt = stmt.join(WorkflowNode, WorkflowNode.workflow_id == Workflow.id).where(
            WorkflowNode.node_type == "tool",
            WorkflowNode.config["toolName"].astext.ilike(tool_pattern),
        )

    return list(db.scalars(stmt).unique().all())
