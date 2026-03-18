import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCreateWorkflowMutation, useProjectQuery, useWorkflowsQuery } from "@/hooks/queries";
import { cn } from "@/lib/utils";

export function WorkflowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectQuery = useProjectQuery(projectId);
  const workflowsQuery = useWorkflowsQuery(projectId);
  const createWorkflowMutation = useCreateWorkflowMutation(projectId);

  const onCreateWorkflow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !name.trim()) {
      return;
    }

    await createWorkflowMutation.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
    });

    setName("");
    setDescription("");
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Project</p>
        <h1 className="text-2xl font-semibold text-slate-900">{projectQuery.data?.name ?? "Workflows"}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Workflow</CardTitle>
          <CardDescription>Add a new graph to this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateWorkflow} className="grid gap-3 md:grid-cols-[2fr_3fr_auto] md:items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Intent Router" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context"
              />
            </div>
            <Button type="submit" disabled={createWorkflowMutation.isPending || !projectId}>
              {createWorkflowMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Workflow List</h2>
        {workflowsQuery.isLoading && <p className="text-sm text-slate-500">Loading workflows...</p>}
        {workflowsQuery.error && <p className="text-sm text-red-600">{(workflowsQuery.error as Error).message}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          {workflowsQuery.data?.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <CardTitle className="text-base">{workflow.name}</CardTitle>
                <CardDescription>{workflow.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/projects/${workflow.project_id}/workflows/${workflow.id}`}
                  className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
                >
                  Open Builder
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
