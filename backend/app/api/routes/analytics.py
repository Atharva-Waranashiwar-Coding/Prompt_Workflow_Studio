from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.analytics import DashboardAnalyticsRead, RecentActivityRead, RunStatusCountsRead, ToolUsageRead
from app.services.analytics_service import get_dashboard_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardAnalyticsRead)
def get_dashboard(
    project_id: UUID | None = Query(default=None),
    recent_limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardAnalyticsRead:
    try:
        payload = get_dashboard_analytics(
            db,
            user_id=current_user.id,
            project_id=project_id,
            recent_limit=recent_limit,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = status.HTTP_403_FORBIDDEN if "Insufficient project permissions" in message else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=status_code, detail=message) from exc

    return DashboardAnalyticsRead(
        total_projects=payload.total_projects,
        total_workflows=payload.total_workflows,
        run_counts=RunStatusCountsRead(**payload.run_counts),
        failed_runs=payload.failed_runs,
        most_used_tools=[ToolUsageRead(**tool_row) for tool_row in payload.most_used_tools],
        recent_activity=[RecentActivityRead.model_validate(log) for log in payload.recent_activity],
    )
