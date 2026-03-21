from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.collaboration import ProjectMembership
from app.models.project import Project

ROLE_OWNER = "owner"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"

ROLE_RANK = {
    ROLE_VIEWER: 10,
    ROLE_EDITOR: 20,
    ROLE_OWNER: 30,
}


@dataclass
class ProjectAccess:
    project: Project
    role: str

    @property
    def can_edit(self) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[ROLE_EDITOR]

    @property
    def can_manage_members(self) -> bool:
        return self.role == ROLE_OWNER

    @property
    def can_run(self) -> bool:
        return ROLE_RANK.get(self.role, 0) >= ROLE_RANK[ROLE_EDITOR]


def _is_role_at_least(role: str, minimum_role: str) -> bool:
    return ROLE_RANK.get(role, 0) >= ROLE_RANK.get(minimum_role, 0)


def get_project_access(db: Session, project_id: UUID, user_id: UUID) -> ProjectAccess | None:
    project = db.get(Project, project_id)
    if project is None:
        return None

    if project.user_id == user_id:
        return ProjectAccess(project=project, role=ROLE_OWNER)

    membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
        )
    )
    if membership is None:
        return None
    return ProjectAccess(project=project, role=membership.role)


def require_project_access(db: Session, project_id: UUID, user_id: UUID, minimum_role: str = ROLE_VIEWER) -> ProjectAccess:
    access = get_project_access(db, project_id=project_id, user_id=user_id)
    if access is None:
        raise ValueError("Project not found or access is denied.")
    if not _is_role_at_least(access.role, minimum_role):
        raise ValueError(f"Insufficient project permissions. Required role: {minimum_role}.")
    return access


def list_accessible_projects(db: Session, user_id: UUID) -> list[Project]:
    stmt = (
        select(Project)
        .outerjoin(
            ProjectMembership,
            (ProjectMembership.project_id == Project.id) & (ProjectMembership.user_id == user_id),
        )
        .where(or_(Project.user_id == user_id, ProjectMembership.id.is_not(None)))
        .order_by(Project.updated_at.desc())
        .distinct()
    )
    return list(db.scalars(stmt).all())


def list_accessible_project_ids(db: Session, user_id: UUID) -> list[UUID]:
    stmt = (
        select(Project.id)
        .outerjoin(
            ProjectMembership,
            (ProjectMembership.project_id == Project.id) & (ProjectMembership.user_id == user_id),
        )
        .where(or_(Project.user_id == user_id, ProjectMembership.id.is_not(None)))
        .distinct()
    )
    return list(db.scalars(stmt).all())
