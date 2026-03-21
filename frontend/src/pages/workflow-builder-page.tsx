import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { NodeConfigPanel } from "@/components/workflow/node-config-panel";
import { NodePalette } from "@/components/workflow/node-palette";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";
import {
  useExecuteWorkflowMutation,
  useProjectAccessQuery,
  usePublishWorkflowVersionMutation,
  useRestoreWorkflowVersionMutation,
  useSaveWorkflowMutation,
  useWorkflowQuery,
  useWorkflowVersionsQuery,
} from "@/hooks/queries";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";

export function WorkflowBuilderPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const navigate = useNavigate();
  const [publishNote, setPublishNote] = useState("");

  const workflowQuery = useWorkflowQuery(workflowId);
  const projectAccessQuery = useProjectAccessQuery(projectId);
  const saveWorkflowMutation = useSaveWorkflowMutation(workflowId, projectId);
  const executeWorkflowMutation = useExecuteWorkflowMutation(workflowId);
  const versionsQuery = useWorkflowVersionsQuery(workflowId);
  const publishVersionMutation = usePublishWorkflowVersionMutation(workflowId);
  const restoreVersionMutation = useRestoreWorkflowVersionMutation(workflowId, projectId);

  const initializeFromWorkflow = useWorkflowBuilderStore((state) => state.initializeFromWorkflow);
  const clear = useWorkflowBuilderStore((state) => state.clear);
  const name = useWorkflowBuilderStore((state) => state.name);
  const description = useWorkflowBuilderStore((state) => state.description);
  const tags = useWorkflowBuilderStore((state) => state.tags);
  const setWorkflowName = useWorkflowBuilderStore((state) => state.setWorkflowName);
  const setWorkflowDescription = useWorkflowBuilderStore((state) => state.setWorkflowDescription);
  const setWorkflowTags = useWorkflowBuilderStore((state) => state.setWorkflowTags);
  const toSavePayload = useWorkflowBuilderStore((state) => state.toSavePayload);
  const isDirty = useWorkflowBuilderStore((state) => state.isDirty);
  const hasNodes = useWorkflowBuilderStore((state) => state.nodeOrder.length > 0);
  const autoLayout = useWorkflowBuilderStore((state) => state.autoLayout);
  const deleteSelectedNode = useWorkflowBuilderStore((state) => state.deleteSelectedNode);
  const duplicateSelectedNode = useWorkflowBuilderStore((state) => state.duplicateSelectedNode);
  const insertTemplate = useWorkflowBuilderStore((state) => state.insertTemplate);

  const access = projectAccessQuery.data;
  const canEdit = Boolean(access?.can_edit);
  const canRun = Boolean(access?.can_run);
  const roleLabel = access?.role ? access.role.toUpperCase() : "VIEWER";
  const readOnly = !canEdit;
  const tagsInputValue = useMemo(() => tags.join(", "), [tags]);

  useEffect(() => {
    if (workflowQuery.data) {
      initializeFromWorkflow(workflowQuery.data);
    }
  }, [workflowQuery.data, initializeFromWorkflow]);

  useEffect(() => {
    return () => clear();
  }, [clear]);

  const onSave = useCallback(async () => {
    if (!canEdit) {
      return;
    }
    const payload = toSavePayload();
    if (!payload || !workflowId) {
      return;
    }
    await saveWorkflowMutation.mutateAsync(payload);
  }, [canEdit, saveWorkflowMutation, toSavePayload, workflowId]);

  const onRun = useCallback(async () => {
    if (!workflowId || !projectId) {
      return;
    }
    if (!canRun) {
      return;
    }

    if (isDirty) {
      const savePayload = toSavePayload();
      if (!savePayload) {
        return;
      }
      await saveWorkflowMutation.mutateAsync(savePayload);
    }

    const run = await executeWorkflowMutation.mutateAsync({});
    void navigate(`/projects/${projectId}/workflows/${workflowId}/runs/${run.id}`);
  }, [
    canRun,
    executeWorkflowMutation,
    isDirty,
    navigate,
    projectId,
    saveWorkflowMutation,
    toSavePayload,
    workflowId,
  ]);

  useEffect(() => {
    const isTypingTarget = (event: KeyboardEvent): boolean => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return false;
      }
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) {
        return;
      }

      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;

      if (mod && key === "s") {
        event.preventDefault();
        void onSave();
        return;
      }

      if (mod && key === "enter") {
        event.preventDefault();
        void onRun();
        return;
      }

      if (key === "a" && canEdit) {
        event.preventDefault();
        autoLayout("LR");
        return;
      }

      if (key === "d" && canEdit) {
        event.preventDefault();
        duplicateSelectedNode();
        return;
      }

      if ((key === "delete" || key === "backspace") && canEdit) {
        event.preventDefault();
        deleteSelectedNode();
        return;
      }

      if (event.shiftKey && key === "t" && canEdit) {
        event.preventDefault();
        insertTemplate(WORKFLOW_TEMPLATES[0], { replaceExisting: !hasNodes });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autoLayout, canEdit, deleteSelectedNode, duplicateSelectedNode, hasNodes, insertTemplate, onRun, onSave]);

  const onPublishVersion = async () => {
    if (!canEdit || !workflowId) {
      return;
    }
    if (isDirty) {
      const savePayload = toSavePayload();
      if (!savePayload) {
        return;
      }
      await saveWorkflowMutation.mutateAsync(savePayload);
    }
    await publishVersionMutation.mutateAsync({ note: publishNote.trim() || null });
    setPublishNote("");
    await versionsQuery.refetch();
  };

  const onRestoreVersion = async (versionId: string) => {
    if (!canEdit || !workflowId) {
      return;
    }
    await restoreVersionMutation.mutateAsync(versionId);
    await workflowQuery.refetch();
    await versionsQuery.refetch();
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
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
              {roleLabel}
            </span>
            <Input
              value={name}
              onChange={(event) => setWorkflowName(event.target.value)}
              className="w-[320px]"
              placeholder="Workflow name"
              disabled={readOnly}
            />
            <Input
              value={description}
              onChange={(event) => setWorkflowDescription(event.target.value)}
              className="w-[360px]"
              placeholder="Workflow description"
              disabled={readOnly}
            />
            <Input
              value={tagsInputValue}
              onChange={(event) => {
                const parsed = event.target.value
                  .split(",")
                  .map((tag) => tag.trim().toLowerCase())
                  .filter((tag, index, list) => Boolean(tag) && list.indexOf(tag) === index);
                setWorkflowTags(parsed);
              }}
              className="w-[320px]"
              placeholder="Tags (comma-separated)"
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/projects/${projectId}/workflows/${workflowId}/runs`} className="text-sm text-brand-700 hover:text-brand-800">
            View Runs
          </Link>
          <Button onClick={onSave} disabled={saveWorkflowMutation.isPending || !isDirty || !canEdit}>
            {saveWorkflowMutation.isPending ? "Saving..." : isDirty ? "Save Workflow" : "Saved"}
          </Button>
          <Button
            variant="secondary"
            onClick={onRun}
            disabled={saveWorkflowMutation.isPending || executeWorkflowMutation.isPending || !canRun}
          >
            {executeWorkflowMutation.isPending ? "Queueing..." : "Run Workflow"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
        Shortcuts: <span className="font-semibold">Ctrl/Cmd+S</span> save, <span className="font-semibold">Ctrl/Cmd+Enter</span> run,{" "}
        <span className="font-semibold">A</span> auto-layout, <span className="font-semibold">D</span> duplicate node,{" "}
        <span className="font-semibold">Del</span> delete node, <span className="font-semibold">Shift+T</span> starter template.
      </div>

      {(saveWorkflowMutation.error || executeWorkflowMutation.error) && (
        <p className="text-sm text-rose-600">
          {((saveWorkflowMutation.error ?? executeWorkflowMutation.error) as Error).message}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Workflow Versions</h2>
            <p className="text-xs text-slate-500">Publish immutable snapshots and restore when needed.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={publishNote}
              onChange={(event) => setPublishNote(event.target.value)}
              placeholder="Publish note (optional)"
              className="w-[260px]"
              disabled={!canEdit}
            />
            <Button
              variant="secondary"
              onClick={onPublishVersion}
              disabled={!canEdit || publishVersionMutation.isPending || saveWorkflowMutation.isPending}
            >
              {publishVersionMutation.isPending ? "Publishing..." : "Publish Version"}
            </Button>
          </div>
        </div>
        {publishVersionMutation.error && (
          <p className="mb-2 text-xs text-rose-600">{(publishVersionMutation.error as Error).message}</p>
        )}
        {restoreVersionMutation.error && (
          <p className="mb-2 text-xs text-rose-600">{(restoreVersionMutation.error as Error).message}</p>
        )}
        <div className="space-y-2">
          {versionsQuery.data?.length ? (
            versionsQuery.data.map((version) => (
              <div
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    v{version.version_number} • {version.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(version.created_at).toLocaleString()} {version.publish_note ? `• ${version.publish_note}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onRestoreVersion(version.id)}
                  disabled={!canEdit || restoreVersionMutation.isPending}
                >
                  {restoreVersionMutation.isPending ? "Restoring..." : "Restore"}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500">No published versions yet.</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        <NodePalette readOnly={readOnly} />
        <WorkflowCanvas readOnly={readOnly} />
        <NodeConfigPanel readOnly={readOnly} />
      </div>
    </div>
  );
}
