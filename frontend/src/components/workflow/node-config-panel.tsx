import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToolsQuery } from "@/hooks/queries";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";

export function NodeConfigPanel() {
  const selectedNodeId = useWorkflowBuilderStore((state) => state.selectedNodeId);
  const selectedNode = useWorkflowBuilderStore((state) =>
    state.selectedNodeId ? state.nodesById[state.selectedNodeId] : null,
  );
  const updateNode = useWorkflowBuilderStore((state) => state.updateNode);
  const toolsQuery = useToolsQuery();

  const [toolParamsText, setToolParamsText] = useState("{}");
  const [toolParamsError, setToolParamsError] = useState<string | null>(null);

  const selectedToolDefinition = useMemo(() => {
    if (!selectedNode || selectedNode.nodeType !== "tool") {
      return null;
    }
    const toolName = (selectedNode.config.toolName as string | undefined) ?? "";
    return toolsQuery.data?.find((tool) => tool.name === toolName) ?? null;
  }, [selectedNode, toolsQuery.data]);

  useEffect(() => {
    if (!selectedNode || selectedNode.nodeType !== "tool") {
      return;
    }

    const nextText = JSON.stringify(selectedNode.config.toolParams ?? {}, null, 2);
    setToolParamsText(nextText);
    setToolParamsError(null);
  }, [selectedNodeId, selectedNode]);

  if (!selectedNodeId || !selectedNode) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base">Node Config</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Select a node to edit its configuration.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{selectedNode.nodeType.toUpperCase()} Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Label</label>
          <Input
            value={selectedNode.label}
            onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })}
          />
        </div>

        {selectedNode.nodeType === "prompt" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Prompt Template</label>
            <Textarea
              value={(selectedNode.config.promptTemplate as string | undefined) ?? ""}
              onChange={(event) =>
                updateNode(selectedNode.id, {
                  config: { promptTemplate: event.target.value },
                })
              }
              placeholder="Write your prompt template"
            />
          </div>
        )}

        {selectedNode.nodeType === "condition" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Condition Expression</label>
            <Textarea
              value={(selectedNode.config.conditionExpression as string | undefined) ?? ""}
              onChange={(event) =>
                updateNode(selectedNode.id, {
                  config: { conditionExpression: event.target.value },
                })
              }
              placeholder="e.g. response.intent === 'purchase'"
            />
            <p className="text-xs text-slate-500">
              Connect this node using the <span className="font-semibold">True</span> and{" "}
              <span className="font-semibold">False</span> handles on the right side.
            </p>
          </div>
        )}

        {selectedNode.nodeType === "output" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Output Format</label>
            <Input
              value={(selectedNode.config.outputFormat as string | undefined) ?? ""}
              onChange={(event) =>
                updateNode(selectedNode.id, {
                  config: { outputFormat: event.target.value },
                })
              }
              placeholder="text | json"
            />
          </div>
        )}

        {selectedNode.nodeType === "tool" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Tool</label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                value={(selectedNode.config.toolName as string | undefined) ?? ""}
                onChange={(event) => {
                  const nextToolName = event.target.value;
                  const nextTool = toolsQuery.data?.find((tool) => tool.name === nextToolName);
                  const nextParams = nextTool?.default_params ?? {};
                  updateNode(selectedNode.id, {
                    config: {
                      toolName: nextToolName,
                      toolParams: nextParams,
                    },
                  });
                  setToolParamsText(JSON.stringify(nextParams, null, 2));
                  setToolParamsError(null);
                }}
              >
                <option value="" disabled>
                  Select a tool
                </option>
                {toolsQuery.data?.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.title}
                  </option>
                ))}
              </select>
              {selectedToolDefinition && (
                <p className="text-xs text-slate-500">{selectedToolDefinition.description}</p>
              )}
              {toolsQuery.error && (
                <p className="text-xs text-rose-600">{(toolsQuery.error as Error).message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Tool Params (JSON)</label>
              <Textarea
                className="min-h-[170px] font-mono text-xs"
                value={toolParamsText}
                onChange={(event) => {
                  setToolParamsText(event.target.value);
                  if (toolParamsError) {
                    setToolParamsError(null);
                  }
                }}
                onBlur={() => {
                  try {
                    const parsed = JSON.parse(toolParamsText) as unknown;
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                      throw new Error("Tool params must be a JSON object.");
                    }
                    updateNode(selectedNode.id, {
                      config: {
                        toolParams: parsed as Record<string, unknown>,
                      },
                    });
                    setToolParamsError(null);
                  } catch (error) {
                    setToolParamsError((error as Error).message);
                  }
                }}
              />
              {toolParamsError && <p className="text-xs text-rose-600">{toolParamsError}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
