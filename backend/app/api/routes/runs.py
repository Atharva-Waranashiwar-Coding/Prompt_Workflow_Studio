from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.run import (
    WorkflowRunDetailRead,
    WorkflowRunRead,
    WorkflowRunStepRetryRequest,
    WorkflowRunTriggerRequest,
)
from app.services.execution_service import (
    execute_workflow_run,
    get_workflow_for_run_for_user,
    get_workflow_run_for_user,
    list_workflow_runs_for_user,
    retry_workflow_run_step,
)
from app.services.workflow_service import get_workflow_for_user

router = APIRouter(tags=["workflow-runs"])


@router.get("/workflows/{workflow_id}/runs", response_model=list[WorkflowRunRead])
def get_workflow_runs(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowRunRead]:
    workflow = get_workflow_for_user(db, workflow_id=workflow_id, user_id=current_user.id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    return list_workflow_runs_for_user(db, workflow_id=workflow.id, user_id=current_user.id)


@router.post("/workflows/{workflow_id}/runs", response_model=WorkflowRunDetailRead, status_code=status.HTTP_201_CREATED)
def post_workflow_run(
    workflow_id: UUID,
    payload: WorkflowRunTriggerRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRunDetailRead:
    workflow = get_workflow_for_user(db, workflow_id=workflow_id, user_id=current_user.id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    try:
        run = execute_workflow_run(
            db,
            workflow=workflow,
            user_id=current_user.id,
            input_payload=(payload.input_payload if payload else {}),
        )
        return run
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/workflow-runs/{run_id}", response_model=WorkflowRunDetailRead)
def get_workflow_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRunDetailRead:
    run = get_workflow_run_for_user(db, run_id=run_id, user_id=current_user.id, with_steps=True)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow run not found")
    return run


@router.post("/workflow-runs/{run_id}/steps/{step_id}/retry", response_model=WorkflowRunDetailRead, status_code=status.HTTP_201_CREATED)
def post_retry_workflow_run_step(
    run_id: UUID,
    step_id: UUID,
    payload: WorkflowRunStepRetryRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRunDetailRead:
    run = get_workflow_run_for_user(db, run_id=run_id, user_id=current_user.id, with_steps=True)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow run not found")

    retry_step = next((step for step in run.steps if step.id == step_id), None)
    if retry_step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow run step not found")

    workflow = get_workflow_for_run_for_user(db, workflow_id=run.workflow_id, user_id=current_user.id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    try:
        retried_run = retry_workflow_run_step(
            db,
            source_run=run,
            retry_step=retry_step,
            workflow=workflow,
            user_id=current_user.id,
            input_payload=(payload.input_payload if payload else None),
        )
        return retried_run
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
