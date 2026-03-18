import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCreateProjectMutation, useProjectsQuery } from "@/hooks/queries";
import { cn } from "@/lib/utils";

export function ProjectsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectsQuery = useProjectsQuery();
  const createProjectMutation = useCreateProjectMutation();

  const onCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    await createProjectMutation.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
    });

    setName("");
    setDescription("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Project</CardTitle>
          <CardDescription>Start a new workspace for prompt workflows.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateProject} className="grid gap-3 md:grid-cols-[2fr_3fr_auto] md:items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Support Assistant" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context"
              />
            </div>
            <Button type="submit" disabled={createProjectMutation.isPending}>
              {createProjectMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        {projectsQuery.isLoading && <p className="text-sm text-slate-500">Loading projects...</p>}
        {projectsQuery.error && <p className="text-sm text-red-600">{(projectsQuery.error as Error).message}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          {projectsQuery.data?.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle className="text-base">{project.name}</CardTitle>
                <CardDescription>{project.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/projects/${project.id}`}
                  className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
                >
                  Open Workflows
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
