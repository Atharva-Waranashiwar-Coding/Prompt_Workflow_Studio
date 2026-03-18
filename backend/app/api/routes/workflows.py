from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.workflow import WorkflowCreate, WorkflowRead, WorkflowSaveRequest
from app.services.project_service import get_project_for_user
from app.services.workflow_service import (
    create_workflow,
    get_workflow_for_user,
    list_workflows,
    save_workflow_graph,
)

router = APIRouter(tags=["workflows"])


@router.get("/projects/{project_id}/workflows", response_model=list[WorkflowRead])
def get_project_workflows(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowRead]:
    project = get_project_for_user(db, project_id=project_id, user_id=current_user.id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return list_workflows(db, project_id)


@router.post("/projects/{project_id}/workflows", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
def post_workflow(
    project_id: UUID,
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    project = get_project_for_user(db, project_id=project_id, user_id=current_user.id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return create_workflow(db, project_id=project.id, name=payload.name, description=payload.description)


@router.get("/workflows/{workflow_id}", response_model=WorkflowRead)
def get_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    workflow = get_workflow_for_user(db, workflow_id=workflow_id, user_id=current_user.id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.put("/workflows/{workflow_id}", response_model=WorkflowRead)
def put_workflow(
    workflow_id: UUID,
    payload: WorkflowSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    workflow = get_workflow_for_user(db, workflow_id=workflow_id, user_id=current_user.id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    try:
        return save_workflow_graph(db, workflow=workflow, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
