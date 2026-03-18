import { Link, useParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkflowRunsQuery } from "@/hooks/queries";
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

export function WorkflowRunsPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();

  const runsQuery = useWorkflowRunsQuery(workflowId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
          <Link to={`/projects/${projectId}/workflows/${workflowId}`} className="hover:text-brand-700">
            Workflow Builder
          </Link>
          <span className="mx-2">/</span>
          Runs
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Workflow Run History</h1>
      </div>

      {runsQuery.isLoading && <p className="text-sm text-slate-500">Loading runs...</p>}
      {runsQuery.error && <p className="text-sm text-rose-600">{(runsQuery.error as Error).message}</p>}

      <div className="space-y-3">
        {runsQuery.data?.length === 0 && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-slate-500">No runs yet. Go back to builder and click Run Workflow.</p>
            </CardContent>
          </Card>
        )}

        {runsQuery.data?.map((run) => (
          <Card key={run.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold text-slate-900">Run {run.id.slice(0, 8)}</CardTitle>
                <span className={cn("rounded-full px-2 py-1 text-xs font-medium uppercase", statusClass(run.status))}>
                  {run.status}
                </span>
              </div>
              <CardDescription>
                Started: {formatDate(run.started_at)} • Completed: {formatDate(run.completed_at)}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                to={`/projects/${projectId}/workflows/${workflowId}/runs/${run.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                View run details
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
