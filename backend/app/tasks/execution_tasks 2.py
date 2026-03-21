from app.core.celery_app import celery_app
from app.services.execution_service import run_workflow_run_in_worker


@celery_app.task(name="app.tasks.execution.process_workflow_run", bind=True)
def process_workflow_run_task(self, run_id: str) -> dict[str, str]:
    run_workflow_run_in_worker(
        run_id=run_id,
        task_id=getattr(self.request, "id", None),
        worker_name=getattr(self.request, "hostname", None),
    )
    return {"run_id": run_id}
