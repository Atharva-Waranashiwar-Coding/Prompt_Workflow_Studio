import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRetryWorkflowRunStepMutation, useWorkflowRunQuery } from "@/hooks/queries";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) {
    return "-";
  }
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "failed") {
    return "bg-rose-100 text-rose-700";
  }
  if (status === "running") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-600";
}

function statusDotClass(status: string): string {
  if (status === "completed") {
    return "bg-emerald-500";
  }
  if (status === "failed") {
    return "bg-rose-500";
  }
  if (status === "running") {
    return "bg-amber-500";
  }
  return "bg-slate-400";
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function WorkflowRunDetailPage() {
  const navigate = useNavigate();
  const { projectId, workflowId, runId } = useParams<{ projectId: string; workflowId: string; runId: string }>();

  const runQuery = useWorkflowRunQuery(runId);
  const retryMutation = useRetryWorkflowRunStepMutation(runId, workflowId);

  if (runQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading run details...</p>;
  }

  if (runQuery.error) {
    return <p className="text-sm text-rose-600">{(runQuery.error as Error).message}</p>;
  }

  const run = runQuery.data;
  if (!run) {
    return <p className="text-sm text-slate-500">Run not found.</p>;
  }

  const onRetryStep = async (stepId: string) => {
    if (!runId || !projectId || !workflowId) {
      return;
    }
    const retriedRun = await retryMutation.mutateAsync({ stepId });
    void navigate(`/projects/${projectId}/workflows/${workflowId}/runs/${retriedRun.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
          <Link to={`/projects/${projectId}/workflows/${workflowId}`} className="hover:text-brand-700">
            Workflow Builder
          </Link>
          <span className="mx-2">/</span>
          <Link to={`/projects/${projectId}/workflows/${workflowId}/runs`} className="hover:text-brand-700">
            Runs
          </Link>
          <span className="mx-2">/</span>
          Run Details
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Run {run.id.slice(0, 8)}</h1>
          <span className={cn("rounded-full px-2 py-1 text-xs font-medium uppercase", statusClass(run.status))}>
            {run.status}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Summary</CardTitle>
          <CardDescription>
            Started: {formatDate(run.started_at)} • Completed: {formatDate(run.completed_at)} • Duration:{" "}
            {formatDuration(run.started_at, run.completed_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {run.error_message && <p className="rounded-md bg-rose-50 p-2 text-rose-700">{run.error_message}</p>}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Final Result</p>
            <pre className="max-h-72 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {pretty(run.result_payload)}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution Timeline</CardTitle>
          <CardDescription>Step-level status, timing, inputs, outputs, memory, and validation traces.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {retryMutation.error && <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-700">{(retryMutation.error as Error).message}</p>}
          {run.steps.length === 0 && <p className="text-sm text-slate-500">No steps were executed for this run.</p>}
          {run.steps.map((step) => {
            const outputRecord = asRecord(step.output_payload);
            const validationRecord = asRecord(outputRecord?.validation);
            const isMemoryStep =
              outputRecord?.operation === "memory_read" || outputRecord?.operation === "memory_write";
            const canRetryStep = run.status === "failed" && step.status === "failed";

            return (
              <div key={step.id} className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("h-2.5 w-2.5 rounded-full", statusDotClass(step.status))} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Step {step.step_index}: {step.node_label}
                      </p>
                      <p className="text-xs text-slate-500">
                        Node Type: {step.node_type} • {formatDate(step.started_at)} → {formatDate(step.completed_at)} •{" "}
                        {formatDuration(step.started_at, step.completed_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium uppercase", statusClass(step.status))}>
                      {step.status}
                    </span>
                    {canRetryStep && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRetryStep(step.id)}
                        disabled={retryMutation.isPending}
                      >
                        {retryMutation.isPending ? "Retrying..." : "Retry Step"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 p-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Input</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                      {pretty(step.input_payload)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Output</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                      {pretty(step.output_payload)}
                    </pre>
                  </div>

                  {validationRecord && (
                    <div className="rounded-md bg-amber-50 p-3 lg:col-span-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Validation Result</p>
                      <pre className="max-h-56 overflow-auto rounded-md bg-amber-100 p-2 text-xs text-amber-900">
                        {pretty(validationRecord)}
                      </pre>
                    </div>
                  )}

                  {isMemoryStep && (
                    <div className="rounded-md bg-indigo-50 p-3 lg:col-span-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">Memory Operation</p>
                      <pre className="max-h-56 overflow-auto rounded-md bg-indigo-100 p-2 text-xs text-indigo-900">
                        {pretty(step.output_payload)}
                      </pre>
                    </div>
                  )}

                  {step.error_message && (
                    <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-700 lg:col-span-2">{step.error_message}</p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
