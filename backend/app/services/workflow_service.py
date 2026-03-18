from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.project import Project
from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode
from app.schemas.workflow import WorkflowSaveRequest


def list_workflows(db: Session, project_id: UUID) -> list[Workflow]:
    stmt = (
        select(Workflow)
        .where(Workflow.project_id == project_id)
        .order_by(Workflow.updated_at.desc())
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return list(db.scalars(stmt).all())


def create_workflow(db: Session, project_id: UUID, name: str, description: str | None = None) -> Workflow:
    workflow = Workflow(project_id=project_id, name=name, description=description)
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


def get_workflow_for_user(db: Session, workflow_id: UUID, user_id: UUID) -> Workflow | None:
    stmt = (
        select(Workflow)
        .join(Project, Project.id == Workflow.project_id)
        .where(Workflow.id == workflow_id, Project.user_id == user_id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return db.scalar(stmt)


def save_workflow_graph(db: Session, workflow: Workflow, payload: WorkflowSaveRequest) -> Workflow:
    node_ids = {node.id for node in payload.nodes}
    for edge in payload.edges:
        if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
            raise ValueError("Each edge must reference nodes in the workflow payload.")

    workflow.name = payload.name
    workflow.description = payload.description
    workflow.updated_at = datetime.now(timezone.utc)

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

    db.commit()
    refreshed = get_workflow_for_user(db, workflow.id, workflow.project.user_id)
    if refreshed is None:
        raise ValueError("Workflow could not be reloaded after save.")
    return refreshed
