from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.workflow import Workflow
from app.models.user import User
from app.schemas.versioning import (
    WorkflowDuplicateRequest,
    WorkflowRestoreResponse,
    WorkflowVersionPublishRequest,
    WorkflowVersionRead,
)
from app.schemas.workflow import WorkflowCreate, WorkflowRead, WorkflowSaveRequest
from app.services.access_service import ROLE_EDITOR, require_project_access
from app.services.workflow_service import (
    create_workflow,
    duplicate_workflow,
    get_workflow_for_user,
    get_workflow_version,
    list_workflow_versions,
    list_workflows,
    publish_workflow_version,
    restore_workflow_version,
    save_workflow_graph,
    search_workflows,
)

router = APIRouter(tags=["workflows"])


def _require_project_access_or_http(
    db: Session,
    *,
    project_id: UUID,
    user_id: UUID,
    minimum_role: str = "viewer",
):
    try:
        return require_project_access(db, project_id=project_id, user_id=user_id, minimum_role=minimum_role)
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_403_FORBIDDEN if "Insufficient project permissions" in message else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message) from exc


def _get_workflow_or_http(db: Session, *, workflow_id: UUID, user_id: UUID) -> Workflow:
    workflow = get_workflow_for_user(db, workflow_id=workflow_id, user_id=user_id)
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.get("/projects/{project_id}/workflows", response_model=list[WorkflowRead])
def get_project_workflows(
    project_id: UUID,
    q: str | None = Query(default=None, description="Search by workflow name/description"),
    tag: str | None = Query(default=None, description="Filter by tag"),
    tool: str | None = Query(default=None, description="Filter by tool name used in tool nodes"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowRead]:
    _require_project_access_or_http(db, project_id=project_id, user_id=current_user.id)
    return list_workflows(db, project_id, query=q, tag=tag, tool=tool)


@router.post("/projects/{project_id}/workflows", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
def post_workflow(
    project_id: UUID,
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    _require_project_access_or_http(
        db,
        project_id=project_id,
        user_id=current_user.id,
        minimum_role=ROLE_EDITOR,
    )
    try:
        return create_workflow(
            db,
            project_id=project_id,
            name=payload.name,
            description=payload.description,
            tags=payload.tags,
            user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/workflows/search", response_model=list[WorkflowRead])
def get_workflow_search(
    q: str | None = Query(default=None, description="Search by name/description"),
    tag: str | None = Query(default=None, description="Filter by tag"),
    tool: str | None = Query(default=None, description="Filter by tool usage"),
    project_id: UUID | None = Query(default=None, description="Filter by project"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowRead]:
    try:
        return search_workflows(
            db,
            user_id=current_user.id,
            query=q,
            tag=tag,
            tool=tool,
            project_id=project_id,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_403_FORBIDDEN if "Insufficient project permissions" in message else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message) from exc


@router.get("/workflows/{workflow_id}", response_model=WorkflowRead)
def get_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    return workflow


@router.put("/workflows/{workflow_id}", response_model=WorkflowRead)
def put_workflow(
    workflow_id: UUID,
    payload: WorkflowSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    _require_project_access_or_http(
        db,
        project_id=workflow.project_id,
        user_id=current_user.id,
        minimum_role=ROLE_EDITOR,
    )

    try:
        return save_workflow_graph(db, workflow=workflow, payload=payload, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/workflows/{workflow_id}/duplicate", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
def post_duplicate_workflow(
    workflow_id: UUID,
    payload: WorkflowDuplicateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRead:
    source_workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    _require_project_access_or_http(
        db,
        project_id=source_workflow.project_id,
        user_id=current_user.id,
        minimum_role=ROLE_EDITOR,
    )
    request_payload = payload or WorkflowDuplicateRequest()
    try:
        return duplicate_workflow(
            db,
            source_workflow=source_workflow,
            payload=request_payload,
            user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/workflows/{workflow_id}/versions", response_model=list[WorkflowVersionRead])
def get_workflow_versions(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowVersionRead]:
    workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    versions = list_workflow_versions(db, workflow_id=workflow.id)
    return [WorkflowVersionRead.model_validate(version) for version in versions]


@router.post(
    "/workflows/{workflow_id}/versions/publish",
    response_model=WorkflowVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def post_publish_workflow_version(
    workflow_id: UUID,
    payload: WorkflowVersionPublishRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowVersionRead:
    workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    _require_project_access_or_http(
        db,
        project_id=workflow.project_id,
        user_id=current_user.id,
        minimum_role=ROLE_EDITOR,
    )
    try:
        version = publish_workflow_version(
            db,
            workflow=workflow,
            user_id=current_user.id,
            note=(payload.note if payload else None),
        )
        return WorkflowVersionRead.model_validate(version)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/workflows/{workflow_id}/versions/{version_id}", response_model=WorkflowVersionRead)
def get_workflow_version_detail(
    workflow_id: UUID,
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowVersionRead:
    workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    version = get_workflow_version(db, workflow_id=workflow.id, version_id=version_id)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow version not found")
    return WorkflowVersionRead.model_validate(version)


@router.post("/workflows/{workflow_id}/versions/{version_id}/restore", response_model=WorkflowRestoreResponse)
def post_restore_workflow_version(
    workflow_id: UUID,
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowRestoreResponse:
    workflow = _get_workflow_or_http(db, workflow_id=workflow_id, user_id=current_user.id)
    _require_project_access_or_http(
        db,
        project_id=workflow.project_id,
        user_id=current_user.id,
        minimum_role=ROLE_EDITOR,
    )

    version = get_workflow_version(db, workflow_id=workflow.id, version_id=version_id)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow version not found")

    try:
        restored = restore_workflow_version(
            db,
            workflow=workflow,
            version=version,
            user_id=current_user.id,
        )
        return WorkflowRestoreResponse(workflow=WorkflowRead.model_validate(restored), restored_from_version_id=version.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
