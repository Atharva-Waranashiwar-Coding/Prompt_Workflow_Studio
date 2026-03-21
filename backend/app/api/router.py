from fastapi import APIRouter

from app.api.routes import analytics, health, projects, runs, tools, workflows

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(projects.router)
api_router.include_router(tools.router)
api_router.include_router(workflows.router)
api_router.include_router(runs.router)
api_router.include_router(analytics.router)
