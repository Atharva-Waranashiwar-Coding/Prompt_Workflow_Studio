import uuid

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.project import Project
from app.models.workflow import Workflow, WorkflowEdge, WorkflowNode
from app.services.auth_service import ensure_default_user


def seed_sample_data() -> None:
    db = SessionLocal()
    try:
        user = ensure_default_user(db)

        existing_project = db.scalar(
            select(Project).where(Project.user_id == user.id, Project.name == "Sample Support Project")
        )
        if existing_project:
            return

        project = Project(user_id=user.id, name="Sample Support Project", description="Seeded example project")
        db.add(project)
        db.flush()

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
