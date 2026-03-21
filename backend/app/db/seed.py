import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.collaboration import ProjectMembership
from app.models.project import Project
from app.models.tool_data import ToolDocument, ToolTemplate
from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode
from app.services.auth_service import ensure_default_user


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


def seed_sample_data() -> None:
    db = SessionLocal()
    try:
        _seed_tool_data(db)
        user = ensure_default_user(db)

        existing_project = db.scalar(
            select(Project).where(Project.user_id == user.id, Project.name == "Sample Support Project")
        )
        if existing_project:
            db.commit()
            return

        project = Project(user_id=user.id, name="Sample Support Project", description="Seeded example project")
        db.add(project)
        db.flush()
        db.add(
            ProjectMembership(
                project_id=project.id,
                user_id=user.id,
                role="owner",
                added_by_user_id=user.id,
            )
        )

        workflow = Workflow(project_id=project.id, name="Sample Triage Workflow", description="Prompt -> Condition -> Output")
        db.add(workflow)
        db.flush()

        prompt_id = uuid.uuid4()
        condition_id = uuid.uuid4()
        output_id = uuid.uuid4()

        db.add_all(
            [
                WorkflowNode(
                    id=prompt_id,
                    workflow_id=workflow.id,
                    node_type="prompt",
                    label="Prompt Node",
                    position_x=120,
                    position_y=140,
                    config={"promptTemplate": "Classify this support request."},
                ),
                WorkflowNode(
                    id=condition_id,
                    workflow_id=workflow.id,
                    node_type="condition",
                    label="Condition Node",
                    position_x=380,
                    position_y=140,
                    config={"conditionExpression": "contains:billing"},
                ),
                WorkflowNode(
                    id=output_id,
                    workflow_id=workflow.id,
                    node_type="output",
                    label="Output Node",
                    position_x=640,
                    position_y=140,
                    config={"outputFormat": "json"},
                ),
            ]
        )

        db.add_all(
            [
                WorkflowEdge(
                    id=uuid.uuid4(),
                    workflow_id=workflow.id,
                    source_node_id=prompt_id,
                    target_node_id=condition_id,
                ),
                WorkflowEdge(
                    id=uuid.uuid4(),
                    workflow_id=workflow.id,
                    source_node_id=condition_id,
                    target_node_id=output_id,
                    source_handle="true",
                ),
                WorkflowEdge(
                    id=uuid.uuid4(),
                    workflow_id=workflow.id,
                    source_node_id=condition_id,
                    target_node_id=output_id,
                    source_handle="false",
                ),
            ]
        )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_sample_data()
