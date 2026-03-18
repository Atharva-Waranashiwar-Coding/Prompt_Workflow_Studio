import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { NodeConfigPanel } from "@/components/workflow/node-config-panel";
import { NodePalette } from "@/components/workflow/node-palette";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveWorkflowMutation, useWorkflowQuery } from "@/hooks/queries";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";

export function WorkflowBuilderPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();

  const workflowQuery = useWorkflowQuery(workflowId);
  const saveWorkflowMutation = useSaveWorkflowMutation(workflowId, projectId);

  const initializeFromWorkflow = useWorkflowBuilderStore((state) => state.initializeFromWorkflow);
  const clear = useWorkflowBuilderStore((state) => state.clear);
  const name = useWorkflowBuilderStore((state) => state.name);
  const description = useWorkflowBuilderStore((state) => state.description);
  const setWorkflowName = useWorkflowBuilderStore((state) => state.setWorkflowName);
  const setWorkflowDescription = useWorkflowBuilderStore((state) => state.setWorkflowDescription);
  const toSavePayload = useWorkflowBuilderStore((state) => state.toSavePayload);
  const isDirty = useWorkflowBuilderStore((state) => state.isDirty);

  useEffect(() => {
    if (workflowQuery.data) {
      initializeFromWorkflow(workflowQuery.data);
    }
  }, [workflowQuery.data, initializeFromWorkflow]);

  useEffect(() => {
    return () => clear();
  }, [clear]);

  const onSave = async () => {
    const payload = toSavePayload();
    if (!payload || !workflowId) {
      return;
    }
    await saveWorkflowMutation.mutateAsync(payload);
  };

  if (workflowQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading workflow...</p>;
  }

  if (workflowQuery.error) {
    return <p className="text-sm text-red-600">{(workflowQuery.error as Error).message}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
            <Link to={`/projects/${projectId}`} className="hover:text-brand-700">
              Project Workflows
            </Link>
            <span className="mx-2">/</span>
            Builder
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              onChange={(event) => setWorkflowName(event.target.value)}
              className="w-[320px]"
              placeholder="Workflow name"
            />
            <Input
              value={description}
              onChange={(event) => setWorkflowDescription(event.target.value)}
              className="w-[360px]"
              placeholder="Workflow description"
            />
          </div>
        </div>

        <Button onClick={onSave} disabled={saveWorkflowMutation.isPending || !isDirty}>
          {saveWorkflowMutation.isPending ? "Saving..." : isDirty ? "Save Workflow" : "Saved"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        <NodePalette />
        <WorkflowCanvas />
        <NodeConfigPanel />
      </div>
    </div>
  );
}
