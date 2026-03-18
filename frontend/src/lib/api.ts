import {
  type ProjectRecord,
  type ToolDefinitionRecord,
  type WorkflowRecord,
  type WorkflowRunDetailRecord,
  type WorkflowRunRecord,
  type WorkflowRunTriggerPayload,
  type WorkflowSavePayload,
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

  return (await response.json()) as T;
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
  payload: { name: string; description?: string | null },
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

export function getTools(): Promise<ToolDefinitionRecord[]> {
  return request<ToolDefinitionRecord[]>("/tools");
}
