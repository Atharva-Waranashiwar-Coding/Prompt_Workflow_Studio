from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.collaboration import ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.services.access_service import list_accessible_projects
from app.services.audit_service import record_audit_log


def list_projects(db: Session, user_id: UUID) -> list[Project]:
    return list_accessible_projects(db, user_id=user_id)


def create_project(db: Session, user_id: UUID, name: str, description: str | None = None) -> Project:
    project = Project(user_id=user_id, name=name, description=description)
    db.add(project)
    db.flush()

    owner_membership = ProjectMembership(
        project_id=project.id,
        user_id=user_id,
        role="owner",
        added_by_user_id=user_id,
    )
    db.add(owner_membership)
    record_audit_log(
        db,
        action="project.created",
        entity_type="project",
        entity_id=str(project.id),
        project_id=project.id,
        user_id=user_id,
        metadata={"name": name},
    )
    db.commit()
    db.refresh(project)
    return project


def get_project_for_user(db: Session, project_id: UUID, user_id: UUID) -> Project | None:
    project = db.get(Project, project_id)
    if project is None:
        return None
    if project.user_id == user_id:
        return project

    membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    )
    if membership is None:
        return None
    return project


def list_project_memberships(db: Session, project_id: UUID) -> list[ProjectMembership]:
    stmt = (
        select(ProjectMembership)
        .where(ProjectMembership.project_id == project_id)
        .options(selectinload(ProjectMembership.user))
        .order_by(ProjectMembership.created_at.asc())
    )
    return list(db.scalars(stmt).all())


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def add_or_update_project_membership(
    db: Session,
    *,
    project_id: UUID,
    email: str,
    display_name: str | None,
    role: str,
    added_by_user_id: UUID,
) -> ProjectMembership:
    normalized_email = _normalize_email(email)
    if role not in {"owner", "editor", "viewer"}:
        raise ValueError("Invalid membership role.")

    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        user = User(
            email=normalized_email,
            display_name=(display_name.strip() if display_name else normalized_email.split("@")[0]),
        )
        db.add(user)
        db.flush()
    elif display_name and display_name.strip():
        user.display_name = display_name.strip()

    membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user.id,
        )
    )
    project = db.get(Project, project_id)
    if project is not None and user.id == project.user_id and role != "owner":
        raise ValueError("Project owner role cannot be downgraded.")

    if membership is None:
        membership = ProjectMembership(
            project_id=project_id,
            user_id=user.id,
            role=role,
            added_by_user_id=added_by_user_id,
        )
        db.add(membership)
    else:
        membership.role = role
        membership.added_by_user_id = added_by_user_id

    db.flush()
    db.refresh(membership)
    return membership


def update_project_membership_role(
    db: Session,
    *,
    project_id: UUID,
    membership_id: UUID,
    role: str,
    acting_user_id: UUID,
) -> ProjectMembership:
    membership = db.scalar(
        select(ProjectMembership)
        .where(
            ProjectMembership.id == membership_id,
            ProjectMembership.project_id == project_id,
        )
        .options(selectinload(ProjectMembership.user))
    )
    if membership is None:
        raise ValueError("Project membership was not found.")
    if role not in {"owner", "editor", "viewer"}:
        raise ValueError("Invalid membership role.")

    project = db.get(Project, project_id)
    if project and membership.user_id == project.user_id and role != "owner":
        raise ValueError("Project owner role cannot be downgraded.")

    membership.role = role
    membership.added_by_user_id = acting_user_id
    db.flush()
    db.refresh(membership)
    return membership


def remove_project_membership(
    db: Session,
    *,
    project_id: UUID,
    membership_id: UUID,
) -> None:
    membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.id == membership_id,
            ProjectMembership.project_id == project_id,
        )
    )
    if membership is None:
        raise ValueError("Project membership was not found.")

    project = db.get(Project, project_id)
    if project and membership.user_id == project.user_id:
        raise ValueError("Project owner membership cannot be removed.")

    db.delete(membership)
    db.flush()
