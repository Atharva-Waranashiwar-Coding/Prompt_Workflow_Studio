import {
  type AuditLogListRecord,
  type DashboardAnalyticsRecord,
  type ProjectAccessRecord,
  type ProjectMembershipRecord,
  type ProjectRecord,
  type ToolDefinitionRecord,
  type WorkflowRecord,
  type WorkflowRestoreResponseRecord,
  type WorkflowRunDetailRecord,
  type WorkflowRunRecord,
  type WorkflowRunRetryPayload,
  type WorkflowRunStepRetryPayload,
  type WorkflowRunTriggerPayload,
  type WorkflowSavePayload,
  type WorkflowVersionRecord,
} from "@/types/workflow";
import { getLocalAuthUserId } from "@/store/auth-store";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": getLocalAuthUserId(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorPayload?.detail ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  if (!raw) {
    return undefined as T;
  }
  return JSON.parse(raw) as T;
}

export function getProjects(): Promise<ProjectRecord[]> {
  return request<ProjectRecord[]>("/projects");
}

export function createProject(payload: { name: string; description?: string | null }): Promise<ProjectRecord> {
  return request<ProjectRecord>("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getProject(projectId: string): Promise<ProjectRecord> {
  return request<ProjectRecord>(`/projects/${projectId}`);
}

export function getWorkflows(projectId: string): Promise<WorkflowRecord[]> {
  return request<WorkflowRecord[]>(`/projects/${projectId}/workflows`);
}

export function createWorkflow(
  projectId: string,
  payload: { name: string; description?: string | null; tags?: string[] },
): Promise<WorkflowRecord> {
  return request<WorkflowRecord>(`/projects/${projectId}/workflows`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getWorkflow(workflowId: string): Promise<WorkflowRecord> {
  return request<WorkflowRecord>(`/workflows/${workflowId}`);
}

export function saveWorkflow(workflowId: string, payload: WorkflowSavePayload): Promise<WorkflowRecord> {
  return request<WorkflowRecord>(`/workflows/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function executeWorkflow(
  workflowId: string,
  payload: WorkflowRunTriggerPayload = {},
): Promise<WorkflowRunDetailRecord> {
  return request<WorkflowRunDetailRecord>(`/workflows/${workflowId}/runs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getWorkflowRuns(workflowId: string): Promise<WorkflowRunRecord[]> {
  return request<WorkflowRunRecord[]>(`/workflows/${workflowId}/runs`);
}

export function getWorkflowRun(runId: string): Promise<WorkflowRunDetailRecord> {
  return request<WorkflowRunDetailRecord>(`/workflow-runs/${runId}`);
}

export function retryWorkflowRunStep(
  runId: string,
  stepId: string,
  payload: WorkflowRunStepRetryPayload = {},
): Promise<WorkflowRunDetailRecord> {
  return request<WorkflowRunDetailRecord>(`/workflow-runs/${runId}/steps/${stepId}/retry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelWorkflowRun(runId: string): Promise<WorkflowRunDetailRecord> {
  return request<WorkflowRunDetailRecord>(`/workflow-runs/${runId}/cancel`, {
    method: "POST",
  });
}

export function retryWorkflowRun(
  runId: string,
  payload: WorkflowRunRetryPayload = {},
): Promise<WorkflowRunDetailRecord> {
  return request<WorkflowRunDetailRecord>(`/workflow-runs/${runId}/retry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTools(): Promise<ToolDefinitionRecord[]> {
  return request<ToolDefinitionRecord[]>("/tools");
}

export function getProjectAccess(projectId: string): Promise<ProjectAccessRecord> {
  return request<ProjectAccessRecord>(`/projects/${projectId}/access`);
}

export function getProjectMembers(projectId: string): Promise<ProjectMembershipRecord[]> {
  return request<ProjectMembershipRecord[]>(`/projects/${projectId}/members`);
}

export function addProjectMember(
  projectId: string,
  payload: { email: string; display_name?: string | null; role: "owner" | "editor" | "viewer" },
): Promise<ProjectMembershipRecord> {
  return request<ProjectMembershipRecord>(`/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProjectMemberRole(
  projectId: string,
  membershipId: string,
  payload: { role: "owner" | "editor" | "viewer" },
): Promise<ProjectMembershipRecord> {
  return request<ProjectMembershipRecord>(`/projects/${projectId}/members/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function removeProjectMember(projectId: string, membershipId: string): Promise<void> {
  return request<void>(`/projects/${projectId}/members/${membershipId}`, {
    method: "DELETE",
  });
}

export function getProjectActivity(
  projectId: string,
  params: { limit?: number; action?: string } = {},
): Promise<AuditLogListRecord> {
  const query = new URLSearchParams();
  if (typeof params.limit === "number") {
    query.set("limit", String(params.limit));
  }
  if (params.action) {
    query.set("action", params.action);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<AuditLogListRecord>(`/projects/${projectId}/activity${suffix}`);
}

export function duplicateWorkflow(
  workflowId: string,
  payload: { name?: string | null; description?: string | null; target_project_id?: string | null; publish_note?: string | null } = {},
): Promise<WorkflowRecord> {
  return request<WorkflowRecord>(`/workflows/${workflowId}/duplicate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getWorkflowVersions(workflowId: string): Promise<WorkflowVersionRecord[]> {
  return request<WorkflowVersionRecord[]>(`/workflows/${workflowId}/versions`);
}

export function publishWorkflowVersion(
  workflowId: string,
  payload: { note?: string | null } = {},
): Promise<WorkflowVersionRecord> {
  return request<WorkflowVersionRecord>(`/workflows/${workflowId}/versions/publish`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function restoreWorkflowVersion(
  workflowId: string,
  versionId: string,
): Promise<WorkflowRestoreResponseRecord> {
  return request<WorkflowRestoreResponseRecord>(`/workflows/${workflowId}/versions/${versionId}/restore`, {
    method: "POST",
  });
}

export function searchWorkflows(params: {
  q?: string;
  tag?: string;
  tool?: string;
  project_id?: string;
}): Promise<WorkflowRecord[]> {
  const query = new URLSearchParams();
  if (params.q) {
    query.set("q", params.q);
  }
  if (params.tag) {
    query.set("tag", params.tag);
  }
  if (params.tool) {
    query.set("tool", params.tool);
  }
  if (params.project_id) {
    query.set("project_id", params.project_id);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<WorkflowRecord[]>(`/workflows/search${suffix}`);
}

export function getDashboardAnalytics(params: { project_id?: string } = {}): Promise<DashboardAnalyticsRecord> {
  const query = new URLSearchParams();
  if (params.project_id) {
    query.set("project_id", params.project_id);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<DashboardAnalyticsRecord>(`/analytics/dashboard${suffix}`);
}
