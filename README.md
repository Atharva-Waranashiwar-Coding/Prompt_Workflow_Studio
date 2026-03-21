# Prompt Workflow Studio

Prompt Workflow Studio is a visual orchestration platform for prompt-first workflows.
It lets users design graph-based flows using nodes (Prompt, Condition, Tool, Memory, Validator, Output), run them, inspect every step, and iterate safely with versions, audit history, and collaboration basics.

## Project Concept

### Problem

Prompt workflows are often built as ad-hoc scripts and become hard to understand, debug, and collaborate on as complexity grows.

### Solution

Provide a product-style visual builder where workflows are:

- Designed as directed graphs
- Executed with reproducible run records
- Observable at node-step granularity
- Versioned and searchable
- Collaborative at project/workspace level

### Core Domain Objects

- `users`: local auth-scaffolded identities
- `projects`: team/workspace-like containers
- `workflows`: editable graphs within a project
- `workflow_nodes` / `workflow_edges`: persisted graph structure
- `workflow_runs` / `workflow_run_steps`: execution state and step logs
- `memory_entries`: structured memory state for workflows/runs
- `workflow_versions`: immutable snapshots for publish/restore
- `project_memberships`: owner/editor/viewer role bindings
- `tags` + `workflow_tags`: discoverability metadata
- `audit_logs`: activity trail across product actions

## Incremental Build (Phase by Phase)

### Phase 1: Foundation + Visual Builder v1

Goal: establish architecture and first editable graph experience.

- Two-app structure (`frontend/`, `backend/`) with Docker Compose
- FastAPI layered backend (`api/routes`, `schemas`, `models`, `services`, `db`, `core`)
- PostgreSQL + SQLAlchemy + Alembic baseline schema
- React + TypeScript + React Flow builder page
- Node palette with Prompt / Condition / Output
- Node config panel and edge connections
- Save/load workflow graph from PostgreSQL

### Phase 2: Execution Engine v1

Goal: make workflows executable end-to-end.

- Backend graph validation and traversal logic
- Condition branching execution
- Run persistence (`workflow_runs`) and per-step logs (`workflow_run_steps`)
- Run history and run detail APIs
- Frontend run trigger from builder
- Run list and run inspector pages

### Phase 3: MCP Tool Integration + Tool Node

Goal: treat tools as a clean execution boundary.

- Internal FastAPI tool endpoints:
  - `template_fetch`
  - `memory_read`
  - `memory_write`
  - `document_lookup`
  - `output_schema_validate`
- Tool registry module + metadata catalog
- Tadata `fastapi-mcp` integration for exposed tool endpoints
- Frontend Tool node with tool picker and JSON params config
- Execution engine support for tool invocation
- Tool input/output/error persisted in step logs

### Phase 4: Memory + Validators + Richer Inspection

Goal: add stateful orchestration and stronger output quality checks.

- Added `memory_read` and `memory_write` node types
- Added `validator` node with required fields, schema-like checks, and simple rules (`contains`, `equals`, `non-empty`)
- Memory persistence scoped by project/workflow/run
- Validation result persistence per step
- Improved run inspection for timeline-style step details
- Node-level retry support for failed/timed-out runs (via retry APIs)

### Phase 5: Background Execution + Reliability Controls

Goal: move from request-bound execution to worker-driven processing.

- Introduced Redis + Celery worker
- Run enqueue model with worker processing
- Status lifecycle:
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `cancelled`
  - `timed_out`
- Retry metadata:
  - `retry_count`
  - `retry_reason`
- Timeout support and cancellation support
- Simulated budget accounting:
  - `token_budget` / `token_used`
  - `context_budget` / `context_used`
- Frontend polling for active run status + cancel/retry controls

### Phase 6: Productization Features

Goal: make the platform demo-ready as a product, not just an engine.

- Workflow versioning: publish/list/restore
- Workflow duplication/fork flow
- Search by name/tag/tool/project
- Tagging support
- Project membership model (`owner`, `editor`, `viewer`)
- Role-based access checks on backend actions
- Audit log for key product events
- Dashboard analytics:
  - total workflows
  - run counts by status
  - failed runs
  - most used tools
  - recent activity

### Phase 7: Builder UX Polish

Goal: improve usability, onboarding, and demo quality.

- Auto-layout in canvas
- Mini-map and better zoom/fit controls
- Keyboard shortcuts:
  - save (`Ctrl/Cmd + S`)
  - run (`Ctrl/Cmd + Enter`)
  - auto-layout (`A`)
  - duplicate/delete node
- Starter templates and template insertion
- Dark mode polish
- Better empty states and onboarding hints
- Run comparison UI in run detail view

## Current Stack

- Frontend: React + TypeScript + Vite + React Flow + Zustand + TanStack Query + Tailwind + shadcn-style UI components
- Backend: FastAPI + Pydantic + SQLAlchemy + Alembic + Celery
- Database: PostgreSQL
- Queue/Broker: Redis
- Dev environment: Docker Compose

## Repository Structure

```text
.
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── tasks/
│   │   └── tools/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── store/
│   │   └── types/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── .env.example
```

## Local Setup

1. Start services:

```bash
docker compose up --build
```

2. Open:

- Frontend: http://localhost:5173
- Backend docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health

## Seed Demo Data

```bash
docker compose exec backend python -m app.db.seed
```

Seed is idempotent and creates:

- Users: `dev@promptworkflow.local`, `editor@promptworkflow.local`, `viewer@promptworkflow.local`
- Projects: `Sample Support Project`, `Sample Ops Project`
- Workflows:
  - `Seeded Support Triage`
  - `Seeded Tool + Memory + Validator`
  - `Seeded Ops Digest`
- Historical runs with terminal statuses and step logs
- Tags, versions, memory entries, and audit activity

## End-to-End Verification Flow

1. Open `http://localhost:5173/` and enter a seeded project.
2. Open a workflow in the builder.
3. Confirm graph loads (nodes + edges visible).
4. Edit a node and click Save.
5. Click Run Workflow.
6. Open Runs and inspect step outputs/errors in Run Details.
7. Publish a version and restore it from Versions panel.
8. Open Dashboard to verify analytics cards and recent activity.

## API Overview

### Health

- `GET /api/health`

### Projects + Memberships + Activity

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/access`
- `GET /api/projects/{project_id}/members`
- `POST /api/projects/{project_id}/members`
- `PATCH /api/projects/{project_id}/members/{membership_id}`
- `DELETE /api/projects/{project_id}/members/{membership_id}`
- `GET /api/projects/{project_id}/activity`

### Workflows + Versions + Search

- `GET /api/projects/{project_id}/workflows`
- `POST /api/projects/{project_id}/workflows`
- `GET /api/workflows/{workflow_id}`
- `PUT /api/workflows/{workflow_id}`
- `GET /api/workflows/search`
- `POST /api/workflows/{workflow_id}/duplicate`
- `GET /api/workflows/{workflow_id}/versions`
- `POST /api/workflows/{workflow_id}/versions/publish`
- `GET /api/workflows/{workflow_id}/versions/{version_id}`
- `POST /api/workflows/{workflow_id}/versions/{version_id}/restore`

### Runs

- `GET /api/workflows/{workflow_id}/runs`
- `POST /api/workflows/{workflow_id}/runs`
- `GET /api/workflow-runs/{run_id}`
- `POST /api/workflow-runs/{run_id}/cancel`
- `POST /api/workflow-runs/{run_id}/retry`
- `POST /api/workflow-runs/{run_id}/steps/{step_id}/retry`

### Tools + MCP-exposed Tool Endpoints

- `GET /api/tools`
- `POST /api/tools/template_fetch`
- `POST /api/tools/memory_read`
- `POST /api/tools/memory_write`
- `POST /api/tools/document_lookup`
- `POST /api/tools/output_schema_validate`

### Analytics

- `GET /api/analytics/dashboard`

## Notes

- Auth is intentionally scaffold-level for now (header-based local user + default user fallback).
- Execution is worker-backed via Celery and Redis.
- Tools are internal/local in this stage (no external provider integration yet).
