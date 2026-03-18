from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User


def ensure_default_user(db: Session) -> User:
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == settings.default_user_email))
    if user:
        return user

    user = User(email=settings.default_user_email, display_name=settings.default_user_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def resolve_user(db: Session, user_id: UUID | None) -> User:
    if user_id:
        user = db.get(User, user_id)
        if user:
            return user
    return ensure_default_user(db)
