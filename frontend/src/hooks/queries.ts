import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addProjectMember,
  cancelWorkflowRun,
  createProject,
  createWorkflow,
  duplicateWorkflow,
  executeWorkflow,
  getDashboardAnalytics,
  getProjectAccess,
  getProjectActivity,
  getProjectMembers,
  getProject,
  getProjects,
  getTools,
  getWorkflow,
  getWorkflowRun,
  getWorkflowRuns,
  getWorkflowVersions,
  getWorkflows,
  publishWorkflowVersion,
  removeProjectMember,
  retryWorkflowRun,
  retryWorkflowRunStep,
  restoreWorkflowVersion,
  saveWorkflow,
  searchWorkflows,
  updateProjectMemberRole,
} from "@/lib/api";
import {
  type ProjectRole,
  type WorkflowRunRecord,
  type WorkflowRunRetryPayload,
  type WorkflowRunStepRetryPayload,
  type WorkflowRunTriggerPayload,
  type WorkflowSavePayload,
} from "@/types/workflow";

export const queryKeys = {
  projects: ["projects"] as const,
  project: (projectId: string) => ["projects", projectId] as const,
  projectAccess: (projectId: string) => ["projects", projectId, "access"] as const,
  projectMembers: (projectId: string) => ["projects", projectId, "members"] as const,
  projectActivity: (projectId: string) => ["projects", projectId, "activity"] as const,
  workflows: (projectId: string) => ["projects", projectId, "workflows"] as const,
  workflowSearch: (projectId: string | undefined, q: string, tag: string, tool: string) =>
    ["workflows", "search", projectId ?? "all", q, tag, tool] as const,
  workflow: (workflowId: string) => ["workflows", workflowId] as const,
  workflowVersions: (workflowId: string) => ["workflows", workflowId, "versions"] as const,
  workflowRuns: (workflowId: string) => ["workflows", workflowId, "runs"] as const,
  workflowRun: (runId: string) => ["workflow-runs", runId] as const,
  dashboardAnalytics: (projectId: string | undefined) => ["analytics", "dashboard", projectId ?? "all"] as const,
  tools: ["tools"] as const,
};

const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);

function hasActiveRuns(runs: WorkflowRunRecord[] | undefined): boolean {
  if (!runs || runs.length === 0) {
    return false;
  }
  return runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status));
}

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
    mutationFn: (payload: { name: string; description?: string | null; tags?: string[] }) =>
      createWorkflow(projectId as string, payload),
    onSuccess: (createdWorkflow) => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflows(projectId) });
        void queryClient.invalidateQueries({ queryKey: ["workflows", "search", projectId] });
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
        void queryClient.invalidateQueries({ queryKey: ["workflows", "search", projectId] });
      }
    },
  });
}

export function useWorkflowSearchQuery(
  projectId: string | undefined,
  params: { q: string; tag: string; tool: string; enabled?: boolean },
) {
  const enabled = params.enabled ?? true;
  return useQuery({
    queryKey: queryKeys.workflowSearch(projectId, params.q, params.tag, params.tool),
    queryFn: () =>
      searchWorkflows({
        project_id: projectId,
        q: params.q || undefined,
        tag: params.tag || undefined,
        tool: params.tool || undefined,
      }),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useWorkflowRunsQuery(workflowId: string | undefined) {
  return useQuery({
    queryKey: workflowId ? queryKeys.workflowRuns(workflowId) : ["workflow-runs", "missing"],
    queryFn: () => getWorkflowRuns(workflowId as string),
    enabled: Boolean(workflowId),
    refetchInterval: (query) => {
      const data = query.state.data as WorkflowRunRecord[] | undefined;
      return hasActiveRuns(data) ? 2_000 : false;
    },
  });
}

export function useWorkflowRunQuery(runId: string | undefined) {
  return useQuery({
    queryKey: runId ? queryKeys.workflowRun(runId) : ["workflow-run", "missing"],
    queryFn: () => getWorkflowRun(runId as string),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const data = query.state.data as WorkflowRunRecord | undefined;
      if (!data) {
        return false;
      }
      return ACTIVE_RUN_STATUSES.has(data.status) ? 2_000 : false;
    },
  });
}

export function useExecuteWorkflowMutation(workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowRunTriggerPayload = {}) =>
      executeWorkflow(workflowId as string, payload),
    onSuccess: (run) => {
      if (workflowId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflowRuns(workflowId) });
      }
      void queryClient.setQueryData(queryKeys.workflowRun(run.id), run);
    },
  });
}

export function useRetryWorkflowRunStepMutation(runId: string | undefined, workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { stepId: string; body?: WorkflowRunStepRetryPayload }) =>
      retryWorkflowRunStep(runId as string, payload.stepId, payload.body ?? {}),
    onSuccess: (run) => {
      void queryClient.setQueryData(queryKeys.workflowRun(run.id), run);
      if (workflowId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflowRuns(workflowId) });
      }
    },
  });
}

export function useCancelWorkflowRunMutation(runId: string | undefined, workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelWorkflowRun(runId as string),
    onSuccess: (run) => {
      void queryClient.setQueryData(queryKeys.workflowRun(run.id), run);
      if (workflowId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflowRuns(workflowId) });
      }
    },
  });
}

export function useRetryWorkflowRunMutation(runId: string | undefined, workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowRunRetryPayload = {}) => retryWorkflowRun(runId as string, payload),
    onSuccess: (run) => {
      void queryClient.setQueryData(queryKeys.workflowRun(run.id), run);
      if (workflowId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflowRuns(workflowId) });
      }
    },
  });
}

export function useToolsQuery() {
  return useQuery({
    queryKey: queryKeys.tools,
    queryFn: getTools,
    staleTime: 60_000,
  });
}

export function useProjectAccessQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? queryKeys.projectAccess(projectId) : ["projects", "missing", "access"],
    queryFn: () => getProjectAccess(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useProjectMembersQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: projectId ? queryKeys.projectMembers(projectId) : ["projects", "missing", "members"],
    queryFn: () => getProjectMembers(projectId as string),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useAddProjectMemberMutation(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; display_name?: string | null; role: ProjectRole }) =>
      addProjectMember(projectId as string, payload),
    onSuccess: () => {
      if (!projectId) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(projectId) });
    },
  });
}

export function useUpdateProjectMemberRoleMutation(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { membershipId: string; role: ProjectRole }) =>
      updateProjectMemberRole(projectId as string, payload.membershipId, { role: payload.role }),
    onSuccess: () => {
      if (!projectId) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(projectId) });
    },
  });
}

export function useRemoveProjectMemberMutation(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => removeProjectMember(projectId as string, membershipId),
    onSuccess: () => {
      if (!projectId) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(projectId) });
    },
  });
}

export function useProjectActivityQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: projectId ? queryKeys.projectActivity(projectId) : ["projects", "missing", "activity"],
    queryFn: () => getProjectActivity(projectId as string, { limit: 20 }),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useDuplicateWorkflowMutation(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { workflowId: string; name?: string | null }) =>
      duplicateWorkflow(payload.workflowId, {
        name: payload.name,
      }),
    onSuccess: (workflow) => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflows(projectId) });
        void queryClient.invalidateQueries({ queryKey: ["workflows", "search", projectId] });
      }
      void queryClient.setQueryData(queryKeys.workflow(workflow.id), workflow);
    },
  });
}

export function useWorkflowVersionsQuery(workflowId: string | undefined) {
  return useQuery({
    queryKey: workflowId ? queryKeys.workflowVersions(workflowId) : ["workflows", "missing", "versions"],
    queryFn: () => getWorkflowVersions(workflowId as string),
    enabled: Boolean(workflowId),
  });
}

export function usePublishWorkflowVersionMutation(workflowId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { note?: string | null } = {}) => publishWorkflowVersion(workflowId as string, payload),
    onSuccess: () => {
      if (workflowId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflowVersions(workflowId) });
      }
    },
  });
}

export function useRestoreWorkflowVersionMutation(workflowId: string | undefined, projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => restoreWorkflowVersion(workflowId as string, versionId),
    onSuccess: (response) => {
      const workflow = response.workflow;
      void queryClient.setQueryData(queryKeys.workflow(workflow.id), workflow);
      if (workflowId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflowVersions(workflowId) });
      }
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workflows(projectId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.projectActivity(projectId) });
      }
    },
  });
}

export function useDashboardAnalyticsQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dashboardAnalytics(projectId),
    queryFn: () => getDashboardAnalytics({ project_id: projectId }),
  });
}
