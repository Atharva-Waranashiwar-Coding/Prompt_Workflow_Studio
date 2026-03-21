from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "prompt_workflow_studio",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.execution_tasks"],
)

celery_app.conf.update(
    task_default_queue=settings.celery_default_queue,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=False,
)
