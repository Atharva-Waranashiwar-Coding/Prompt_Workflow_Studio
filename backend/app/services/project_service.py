from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project


def list_projects(db: Session, user_id: UUID) -> list[Project]:
    stmt = select(Project).where(Project.user_id == user_id).order_by(Project.updated_at.desc())
    return list(db.scalars(stmt).all())


def create_project(db: Session, user_id: UUID, name: str, description: str | None = None) -> Project:
    project = Project(user_id=user_id, name=name, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_project_for_user(db: Session, project_id: UUID, user_id: UUID) -> Project | None:
    stmt = select(Project).where(Project.id == project_id, Project.user_id == user_id)
    return db.scalar(stmt)
