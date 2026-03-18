import { Link, useParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkflowRunQuery } from "@/hooks/queries";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
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

function pretty(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function WorkflowRunDetailPage() {
  const { projectId, workflowId, runId } = useParams<{ projectId: string; workflowId: string; runId: string }>();

  const runQuery = useWorkflowRunQuery(runId);

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
        <div className="flex items-center gap-3">
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
            Started: {formatDate(run.started_at)} • Completed: {formatDate(run.completed_at)}
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

      <div className="space-y-3">
        {run.steps.length === 0 && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-slate-500">No steps were executed for this run.</p>
            </CardContent>
          </Card>
        )}
        {run.steps.map((step) => (
          <Card key={step.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Step {step.step_index}: {step.node_label}
                </CardTitle>
                <span className={cn("rounded-full px-2 py-1 text-xs font-medium uppercase", statusClass(step.status))}>
                  {step.status}
                </span>
              </div>
              <CardDescription>
                Node Type: {step.node_type} • Started: {formatDate(step.started_at)} • Completed: {formatDate(step.completed_at)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
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
              {step.error_message && (
                <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-700 lg:col-span-2">{step.error_message}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
