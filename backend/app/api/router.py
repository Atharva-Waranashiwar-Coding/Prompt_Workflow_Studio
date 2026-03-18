from fastapi import APIRouter

from app.api.routes import health, projects, workflows

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(projects.router)
api_router.include_router(workflows.router)
