import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createProject,
  createWorkflow,
  getProject,
  getProjects,
  getWorkflow,
  getWorkflows,
  saveWorkflow,
} from "@/lib/api";
import { type WorkflowSavePayload } from "@/types/workflow";

export const queryKeys = {
  projects: ["projects"] as const,
  project: (projectId: string) => ["projects", projectId] as const,
  workflows: (projectId: string) => ["projects", projectId, "workflows"] as const,
  workflow: (workflowId: string) => ["workflows", workflowId] as const,
};

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: getProjects,
  });
}

export function useProjectQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? queryKeys.project(projectId) : ["projects", "missing"],
    queryFn: () => getProject(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useWorkflowsQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? queryKeys.workflows(projectId) : ["workflows", "missing"],
    queryFn: () => getWorkflows(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useCreateWorkflowMutation(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string | null }) =>
      createWorkflow(projectId as string, payload),
    onSuccess: (createdWorkflow) => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflows(projectId) });
      }
      void queryClient.setQueryData(queryKeys.workflow(createdWorkflow.id), createdWorkflow);
    },
  });
}

export function useWorkflowQuery(workflowId: string | undefined) {
  return useQuery({
    queryKey: workflowId ? queryKeys.workflow(workflowId) : ["workflow", "missing"],
    queryFn: () => getWorkflow(workflowId as string),
    enabled: Boolean(workflowId),
  });
}

export function useSaveWorkflowMutation(workflowId: string | undefined, projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowSavePayload) => saveWorkflow(workflowId as string, payload),
    onSuccess: (savedWorkflow) => {
      void queryClient.setQueryData(queryKeys.workflow(savedWorkflow.id), savedWorkflow);
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflows(projectId) });
      }
    },
  });
}
