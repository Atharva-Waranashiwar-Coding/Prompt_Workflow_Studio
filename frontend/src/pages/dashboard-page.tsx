import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardAnalyticsQuery } from "@/hooks/queries";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function DashboardPage() {
  const analyticsQuery = useDashboardAnalyticsQuery(undefined);
  const data = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Product Analytics</p>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      </div>

      {analyticsQuery.isLoading && <p className="text-sm text-slate-500">Loading analytics...</p>}
      {analyticsQuery.error && <p className="text-sm text-rose-600">{(analyticsQuery.error as Error).message}</p>}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Total Projects</CardDescription>
                <CardTitle>{data.total_projects}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Total Workflows</CardDescription>
                <CardTitle>{data.total_workflows}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Total Runs</CardDescription>
                <CardTitle>{data.run_counts.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Failed Runs</CardDescription>
                <CardTitle>{data.failed_runs}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Run Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>Queued: {data.run_counts.queued}</p>
                <p>Running: {data.run_counts.running}</p>
                <p>Completed: {data.run_counts.completed}</p>
                <p>Failed: {data.run_counts.failed}</p>
                <p>Cancelled: {data.run_counts.cancelled}</p>
                <p>Timed Out: {data.run_counts.timed_out}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most Used Tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data.most_used_tools.length ? (
                  data.most_used_tools.map((tool) => (
                    <div key={tool.tool_name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                      <span>{tool.tool_name}</span>
                      <span className="font-semibold">{tool.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">No tool usage yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recent_activity.length ? (
                data.recent_activity.map((event) => (
                  <div key={event.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{event.action}</p>
                    <p className="text-xs text-slate-500">{formatDate(event.created_at)}</p>
                    {event.workflow_id && (
                      <Link to={`/projects/${event.project_id}/workflows/${event.workflow_id}`} className="text-xs text-brand-700">
                        Open workflow
                      </Link>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
