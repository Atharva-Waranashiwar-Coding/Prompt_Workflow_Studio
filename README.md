# Prompt Workflow Studio (Phase 1)

Phase 1 foundation for a visual prompt workflow orchestration platform.

## Stack

- Frontend: React + TypeScript + Vite + React Flow + Zustand + TanStack Query + Tailwind + shadcn-style UI components
- Backend: FastAPI + Pydantic + SQLAlchemy + Alembic + Celery
- Database: PostgreSQL
- Queue/Broker: Redis
- Dev environment: Docker Compose

## Project Structure

```text
.
├── backend/
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/0001_initial_schema.py
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py
│   │   │   ├── router.py
│   │   │   └── routes/
│   │   │       ├── health.py
│   │   │       ├── projects.py
│   │   │       └── workflows.py
│   │   ├── core/config.py
│   │   ├── db/
│   │   │   ├── base.py
│   │   │   ├── seed.py
│   │   │   └── session.py
│   │   ├── models/
│   │   │   ├── project.py
│   │   │   ├── user.py
│   │   │   └── workflow.py
│   │   ├── schemas/
│   │   │   ├── project.py
│   │   │   └── workflow.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── project_service.py
│   │   │   └── workflow_service.py
│   │   └── main.py
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── ui/
│   │   │   └── workflow/
│   │   ├── hooks/queries.ts
│   │   ├── lib/api.ts
│   │   ├── pages/
│   │   │   ├── projects-page.tsx
│   │   │   ├── workflows-page.tsx
│   │   │   └── workflow-builder-page.tsx
│   │   ├── store/
│   │   │   ├── auth-store.ts
│   │   │   └── workflow-builder-store.ts
│   │   ├── types/workflow.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── .env.example
```

## Database Schema (Phase 1)

- `users`
- `projects`
- `workflows`
- `workflow_nodes`
- `workflow_edges`

All graph entities are persisted in PostgreSQL via SQLAlchemy models and Alembic migration `0001_initial_schema`.

## Run Locally

1. Start all services:

```bash
docker compose up --build
```

2. Open:
- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

## What Works in Phase 1

- Create projects
- Create workflows inside a project
- Open workflow builder canvas
- Add Prompt / Condition / Output nodes
- Connect nodes with edges
- Edit node configuration in side panel
- Save workflow to backend
- Reload workflow and continue editing

## Phase 2 Execution Engine

- Trigger workflow runs from the builder
- Synchronous traversal across `prompt` -> `condition` branches -> `output`
- Persist run headers (`workflow_runs`) and step logs (`workflow_run_steps`)
- Inspect run history for a workflow
- Inspect run details with per-step input/output/error

## Phase 3 MCP + Tool Nodes

- Added `tool` node support in visual workflow builder
- Added backend tool registry and internal FastAPI tool endpoints
- Exposed tool endpoints via Tadata `fastapi-mcp` integration
- Added Tool picker + Tool params config in node side panel
- Added execution engine support for invoking Tool nodes
- Persisted Tool node execution input/output/error in run steps
- MCP mount path is configurable via `MCP_MOUNT_PATH` (default: `/mcp`)

## Phase 5 Background Execution + Budgets

- Added Redis + Celery worker for background workflow execution
- `POST /api/workflows/{workflow_id}/runs` now enqueues runs and returns immediately
- Run lifecycle now supports: `queued`, `running`, `completed`, `failed`, `cancelled`, `timed_out`
- Added cancellation endpoint for active runs
- Added run retry and failed-step retry enqueue flows
- Added run/step retry metadata (`retry_count`, `retry_reason`)
- Added timeout and simulated budget tracking (`token_budget`, `token_used`, `context_budget`, `context_used`)
- Frontend run views now poll active runs and expose cancel/retry actions

## API Endpoints

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/workflows`
- `POST /api/projects/{project_id}/workflows`
- `GET /api/workflows/{workflow_id}`
- `PUT /api/workflows/{workflow_id}`
- `GET /api/workflows/{workflow_id}/runs`
- `POST /api/workflows/{workflow_id}/runs`
- `GET /api/workflow-runs/{run_id}`
- `POST /api/workflow-runs/{run_id}/cancel`
- `POST /api/workflow-runs/{run_id}/retry`
- `POST /api/workflow-runs/{run_id}/steps/{step_id}/retry`
- `GET /api/tools`
- `POST /api/tools/template_fetch`
- `POST /api/tools/memory_read`
- `POST /api/tools/memory_write`
- `POST /api/tools/document_lookup`
- `POST /api/tools/output_schema_validate`

## Optional Seed

After DB migration is applied, seed one sample project/workflow:

```bash
docker compose exec backend python -m app.db.seed
```

## Notes

- Authentication is scaffolded only (local user header + default dev user bootstrap).
- Execution remains synchronous in-request for now.
- Tools are local/internal only for this phase (no external providers yet).
