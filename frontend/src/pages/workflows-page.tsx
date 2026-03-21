import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useAddProjectMemberMutation,
  useCreateWorkflowMutation,
  useDuplicateWorkflowMutation,
  useProjectAccessQuery,
  useProjectActivityQuery,
  useProjectMembersQuery,
  useProjectQuery,
  useRemoveProjectMemberMutation,
  useUpdateProjectMemberRoleMutation,
  useWorkflowSearchQuery,
} from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { type ProjectRole } from "@/types/workflow";

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag, index, array) => Boolean(tag) && array.indexOf(tag) === index);
}

export function WorkflowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTag, setSearchTag] = useState("");
  const [searchTool, setSearchTool] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberDisplayName, setMemberDisplayName] = useState("");
  const [memberRole, setMemberRole] = useState<ProjectRole>("viewer");

  const projectQuery = useProjectQuery(projectId);
  const projectAccessQuery = useProjectAccessQuery(projectId);
  const workflowsQuery = useWorkflowSearchQuery(projectId, {
    q: searchQuery,
    tag: searchTag,
    tool: searchTool,
  });
  const createWorkflowMutation = useCreateWorkflowMutation(projectId);
  const duplicateWorkflowMutation = useDuplicateWorkflowMutation(projectId);
  const membersQuery = useProjectMembersQuery(projectId, Boolean(projectId));
  const addMemberMutation = useAddProjectMemberMutation(projectId);
  const updateMemberRoleMutation = useUpdateProjectMemberRoleMutation(projectId);
  const removeMemberMutation = useRemoveProjectMemberMutation(projectId);
  const projectActivityQuery = useProjectActivityQuery(projectId, Boolean(projectId));

  const access = projectAccessQuery.data;
  const canEdit = Boolean(access?.can_edit);
  const canManageMembers = Boolean(access?.can_manage_members);

  const onCreateWorkflow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !name.trim() || !canEdit) {
      return;
    }

    await createWorkflowMutation.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      tags: parseTags(tagsInput),
    });

    setName("");
    setDescription("");
    setTagsInput("");
  };

  const onAddMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !memberEmail.trim() || !canManageMembers) {
      return;
    }

    await addMemberMutation.mutateAsync({
      email: memberEmail.trim(),
      display_name: memberDisplayName.trim() || null,
      role: memberRole,
    });

    setMemberEmail("");
    setMemberDisplayName("");
    setMemberRole("viewer");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Project</p>
          <h1 className="text-2xl font-semibold text-slate-900">{projectQuery.data?.name ?? "Workflows"}</h1>
          {access?.role && (
            <p className="mt-1 text-xs text-slate-500">
              Role: <span className="font-semibold uppercase text-slate-700">{access.role}</span>
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Workflow</CardTitle>
          <CardDescription>Add a new graph to this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateWorkflow} className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Intent Router"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Tags</label>
              <Input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="support, billing, triage"
                disabled={!canEdit}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={createWorkflowMutation.isPending || !projectId || !canEdit}>
                {createWorkflowMutation.isPending ? "Creating..." : "Create Workflow"}
              </Button>
            </div>
          </form>
          {!canEdit && (
            <p className="mt-2 text-xs text-slate-500">
              Viewer access: workflow creation and editing are disabled.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search & Filters</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Name or description"
              />
              <Input value={searchTag} onChange={(event) => setSearchTag(event.target.value)} placeholder="Tag" />
              <Input value={searchTool} onChange={(event) => setSearchTool(event.target.value)} placeholder="Tool name" />
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
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {workflow.tags?.length ? (
                        workflow.tags.map((tag) => (
                          <span
                            key={`${workflow.id}-${tag}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">No tags</span>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Link
                        to={`/projects/${workflow.project_id}/workflows/${workflow.id}`}
                        className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
                      >
                        Open Builder
                      </Link>
                      <Button
                        variant="secondary"
                        disabled={!canEdit || duplicateWorkflowMutation.isPending}
                        onClick={() =>
                          duplicateWorkflowMutation.mutate({
                            workflowId: workflow.id,
                            name: `${workflow.name} (Copy)`,
                          })
                        }
                      >
                        {duplicateWorkflowMutation.isPending ? "Duplicating..." : "Duplicate Workflow"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Members</CardTitle>
              <CardDescription>Owner/editor/viewer access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {membersQuery.isLoading && <p className="text-xs text-slate-500">Loading members...</p>}
              {membersQuery.error && <p className="text-xs text-rose-600">{(membersQuery.error as Error).message}</p>}

              <div className="space-y-2">
                {membersQuery.data?.map((member) => (
                  <div key={member.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <p className="text-sm font-medium text-slate-900">{member.user_display_name || member.user_email}</p>
                    <p className="text-xs text-slate-500">{member.user_email}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(event) =>
                          updateMemberRoleMutation.mutate({
                            membershipId: member.id,
                            role: event.target.value as ProjectRole,
                          })
                        }
                        disabled={!canManageMembers || updateMemberRoleMutation.isPending}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
                      >
                        <option value="owner">owner</option>
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canManageMembers || removeMemberMutation.isPending || member.role === "owner"}
                        onClick={() => removeMemberMutation.mutate(member.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {canManageMembers && (
                <form onSubmit={onAddMember} className="space-y-2 border-t border-slate-200 pt-3">
                  <Input
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    placeholder="member@email.com"
                  />
                  <Input
                    value={memberDisplayName}
                    onChange={(event) => setMemberDisplayName(event.target.value)}
                    placeholder="Display name (optional)"
                  />
                  <select
                    value={memberRole}
                    onChange={(event) => setMemberRole(event.target.value as ProjectRole)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="owner">owner</option>
                  </select>
                  <Button type="submit" disabled={addMemberMutation.isPending}>
                    {addMemberMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {projectActivityQuery.isLoading && <p className="text-xs text-slate-500">Loading activity...</p>}
              {projectActivityQuery.error && (
                <p className="text-xs text-rose-600">{(projectActivityQuery.error as Error).message}</p>
              )}
              {projectActivityQuery.data?.items?.length ? (
                projectActivityQuery.data.items.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs font-semibold text-slate-700">{item.action}</p>
                    <p className="text-[11px] text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No recent activity found.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
