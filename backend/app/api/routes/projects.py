from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.audit import AuditLogListRead, AuditLogRead
from app.schemas.collaboration import (
    ProjectAccessRead,
    ProjectMembershipCreate,
    ProjectMembershipRead,
    ProjectMembershipUpdate,
)
from app.schemas.project import ProjectCreate, ProjectRead
from app.services.access_service import ROLE_OWNER, require_project_access
from app.services.audit_service import list_project_audit_logs, record_audit_log
from app.services.project_service import (
    add_or_update_project_membership,
    create_project,
    list_project_memberships,
    list_projects,
    remove_project_membership,
    update_project_membership_role,
)

router = APIRouter(prefix="/projects", tags=["projects"])


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


@router.get("", response_model=list[ProjectRead])
def get_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectRead]:
    return list_projects(db, current_user.id)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def post_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectRead:
    return create_project(db, user_id=current_user.id, name=payload.name, description=payload.description)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectRead:
    return _require_project_access_or_http(db, project_id=project_id, user_id=current_user.id).project


@router.get("/{project_id}/access", response_model=ProjectAccessRead)
def get_project_access_summary(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectAccessRead:
    access = _require_project_access_or_http(db, project_id=project_id, user_id=current_user.id)
    return ProjectAccessRead(
        project_id=project_id,
        role=access.role,  # type: ignore[arg-type]
        can_edit=access.can_edit,
        can_manage_members=access.can_manage_members,
        can_run=access.can_run,
    )


def _to_membership_read(membership) -> ProjectMembershipRead:
    return ProjectMembershipRead(
        id=membership.id,
        project_id=membership.project_id,
        user_id=membership.user_id,
        role=membership.role,
        added_by_user_id=membership.added_by_user_id,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
        user_email=membership.user.email if membership.user else "",
        user_display_name=membership.user.display_name if membership.user else "",
    )


@router.get("/{project_id}/members", response_model=list[ProjectMembershipRead])
def get_project_members(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectMembershipRead]:
    _require_project_access_or_http(db, project_id=project_id, user_id=current_user.id)
    memberships = list_project_memberships(db, project_id=project_id)
    return [_to_membership_read(item) for item in memberships]


@router.post("/{project_id}/members", response_model=ProjectMembershipRead, status_code=status.HTTP_201_CREATED)
def post_project_member(
    project_id: UUID,
    payload: ProjectMembershipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMembershipRead:
    project = _require_project_access_or_http(
        db,
        project_id=project_id,
        user_id=current_user.id,
        minimum_role=ROLE_OWNER,
    ).project

    try:
        membership = add_or_update_project_membership(
            db,
            project_id=project_id,
            email=payload.email,
            display_name=payload.display_name,
            role=payload.role,
            added_by_user_id=current_user.id,
        )
        record_audit_log(
            db,
            action="member.added",
            entity_type="project_membership",
            entity_id=str(membership.id),
            project_id=project.id,
            user_id=current_user.id,
            metadata={
                "member_user_id": str(membership.user_id),
                "member_email": membership.user.email if membership.user else payload.email,
                "role": membership.role,
            },
        )
        db.commit()
        db.refresh(membership)
        return _to_membership_read(membership)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{project_id}/members/{membership_id}", response_model=ProjectMembershipRead)
def patch_project_member(
    project_id: UUID,
    membership_id: UUID,
    payload: ProjectMembershipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMembershipRead:
    project = _require_project_access_or_http(
        db,
        project_id=project_id,
        user_id=current_user.id,
        minimum_role=ROLE_OWNER,
    ).project
    try:
        membership = update_project_membership_role(
            db,
            project_id=project_id,
            membership_id=membership_id,
            role=payload.role,
            acting_user_id=current_user.id,
        )
        record_audit_log(
            db,
            action="member.role_updated",
            entity_type="project_membership",
            entity_id=str(membership.id),
            project_id=project.id,
            user_id=current_user.id,
            metadata={
                "member_user_id": str(membership.user_id),
                "role": membership.role,
            },
        )
        db.commit()
        db.refresh(membership)
        return _to_membership_read(membership)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{project_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_member(
    project_id: UUID,
    membership_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    project = _require_project_access_or_http(
        db,
        project_id=project_id,
        user_id=current_user.id,
        minimum_role=ROLE_OWNER,
    ).project

    try:
        remove_project_membership(db, project_id=project_id, membership_id=membership_id)
        record_audit_log(
            db,
            action="member.removed",
            entity_type="project_membership",
            entity_id=str(membership_id),
            project_id=project.id,
            user_id=current_user.id,
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{project_id}/activity", response_model=AuditLogListRead)
def get_project_activity(
    project_id: UUID,
    limit: int = 30,
    action: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuditLogListRead:
    _require_project_access_or_http(db, project_id=project_id, user_id=current_user.id)
    items, total = list_project_audit_logs(
        db,
        project_id=project_id,
        limit=max(1, min(limit, 200)),
        action=action.strip() if action else None,
    )
    return AuditLogListRead(
        items=[AuditLogRead.model_validate(item) for item in items],
        total=total,
    )
