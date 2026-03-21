import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToolsQuery } from "@/hooks/queries";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";
import { type MemoryScope, type ValidatorRule } from "@/types/workflow";

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(text: string, label: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

type NodeConfigPanelProps = {
  readOnly?: boolean;
};

export function NodeConfigPanel({ readOnly = false }: NodeConfigPanelProps) {
  const selectedNodeId = useWorkflowBuilderStore((state) => state.selectedNodeId);
  const selectedNode = useWorkflowBuilderStore((state) =>
    state.selectedNodeId ? state.nodesById[state.selectedNodeId] : null,
  );
  const updateNode = useWorkflowBuilderStore((state) => state.updateNode);
  const toolsQuery = useToolsQuery();

  const [toolParamsText, setToolParamsText] = useState("{}");
  const [toolParamsError, setToolParamsError] = useState<string | null>(null);
  const [validatorSchemaText, setValidatorSchemaText] = useState("{}");
  const [validatorSchemaError, setValidatorSchemaError] = useState<string | null>(null);
  const [validatorRulesText, setValidatorRulesText] = useState("[]");
  const [validatorRulesError, setValidatorRulesError] = useState<string | null>(null);
  const [requiredFieldsText, setRequiredFieldsText] = useState("");

  const selectedToolDefinition = useMemo(() => {
    if (!selectedNode || selectedNode.nodeType !== "tool") {
      return null;
    }
    const toolName = (selectedNode.config.toolName as string | undefined) ?? "";
    return toolsQuery.data?.find((tool) => tool.name === toolName) ?? null;
  }, [selectedNode, toolsQuery.data]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    if (selectedNode.nodeType === "tool") {
      setToolParamsText(JSON.stringify(selectedNode.config.toolParams ?? {}, null, 2));
      setToolParamsError(null);
    }

    if (selectedNode.nodeType === "validator") {
      setValidatorSchemaText(JSON.stringify(selectedNode.config.schema ?? {}, null, 2));
      setValidatorRulesText(JSON.stringify(selectedNode.config.rules ?? [], null, 2));
      const required = Array.isArray(selectedNode.config.requiredFields)
        ? (selectedNode.config.requiredFields as string[])
        : [];
      setRequiredFieldsText(required.join(", "));
      setValidatorSchemaError(null);
      setValidatorRulesError(null);
    }
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
      <CardContent>
        <fieldset disabled={readOnly} className="space-y-4 disabled:cursor-not-allowed disabled:opacity-80">
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
              placeholder="e.g. contains:billing"
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
              {selectedToolDefinition && <p className="text-xs text-slate-500">{selectedToolDefinition.description}</p>}
              {toolsQuery.error && <p className="text-xs text-rose-600">{(toolsQuery.error as Error).message}</p>}
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
                    const parsed = parseJsonObject(toolParamsText, "Tool params");
                    updateNode(selectedNode.id, {
                      config: {
                        toolParams: parsed,
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

        {(selectedNode.nodeType === "memory_read" || selectedNode.nodeType === "memory_write") && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Memory Scope</label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                value={(selectedNode.config.memoryScope as MemoryScope | undefined) ?? "workflow"}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    config: { memoryScope: event.target.value as MemoryScope },
                  })
                }
              >
                <option value="project">Project</option>
                <option value="workflow">Workflow</option>
                <option value="run">Run</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Memory Key</label>
              <Input
                value={(selectedNode.config.memoryKey as string | undefined) ?? ""}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    config: { memoryKey: event.target.value },
                  })
                }
                placeholder="session.summary"
              />
            </div>
          </>
        )}

        {selectedNode.nodeType === "memory_read" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Fallback Value</label>
            <Textarea
              className="min-h-[110px] text-xs"
              value={
                typeof selectedNode.config.fallbackValue === "string"
                  ? selectedNode.config.fallbackValue
                  : JSON.stringify(selectedNode.config.fallbackValue ?? "", null, 2)
              }
              onChange={(event) =>
                updateNode(selectedNode.id, {
                  config: { fallbackValue: event.target.value },
                })
              }
              placeholder="Default value when memory key is missing"
            />
          </div>
        )}

        {selectedNode.nodeType === "memory_write" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Value Template</label>
            <Textarea
              className="min-h-[110px] font-mono text-xs"
              value={String(selectedNode.config.valueTemplate ?? "{{last_output}}")}
              onChange={(event) =>
                updateNode(selectedNode.id, {
                  config: { valueTemplate: event.target.value },
                })
              }
              placeholder="{{last_output}}"
            />
          </div>
        )}

        {selectedNode.nodeType === "validator" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Target Path</label>
              <Input
                value={(selectedNode.config.targetPath as string | undefined) ?? "last_output"}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    config: { targetPath: event.target.value },
                  })
                }
                placeholder="last_output"
              />
              <p className="text-xs text-slate-500">Use `last_output`, `run_input`, or dot-paths like `step_outputs.&lt;nodeId&gt;`.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Required Fields (comma-separated)</label>
              <Input
                value={requiredFieldsText}
                onChange={(event) => setRequiredFieldsText(event.target.value)}
                onBlur={() => {
                  const parsed = requiredFieldsText
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean);
                  updateNode(selectedNode.id, {
                    config: { requiredFields: parsed },
                  });
                }}
                placeholder="result, intent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Schema (JSON)</label>
              <Textarea
                className="min-h-[130px] font-mono text-xs"
                value={validatorSchemaText}
                onChange={(event) => {
                  setValidatorSchemaText(event.target.value);
                  if (validatorSchemaError) {
                    setValidatorSchemaError(null);
                  }
                }}
                onBlur={() => {
                  try {
                    const parsed = parseJsonObject(validatorSchemaText, "Schema");
                    updateNode(selectedNode.id, {
                      config: { schema: parsed },
                    });
                    setValidatorSchemaError(null);
                  } catch (error) {
                    setValidatorSchemaError((error as Error).message);
                  }
                }}
              />
              {validatorSchemaError && <p className="text-xs text-rose-600">{validatorSchemaError}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Rules (JSON Array)</label>
              <Textarea
                className="min-h-[130px] font-mono text-xs"
                value={validatorRulesText}
                onChange={(event) => {
                  setValidatorRulesText(event.target.value);
                  if (validatorRulesError) {
                    setValidatorRulesError(null);
                  }
                }}
                onBlur={() => {
                  try {
                    const parsed = parseJsonArray(validatorRulesText, "Rules");
                    updateNode(selectedNode.id, {
                      config: { rules: parsed as unknown as ValidatorRule[] },
                    });
                    setValidatorRulesError(null);
                  } catch (error) {
                    setValidatorRulesError((error as Error).message);
                  }
                }}
              />
              {validatorRulesError && <p className="text-xs text-rose-600">{validatorRulesError}</p>}
            </div>
            <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <input
                type="checkbox"
                checked={Boolean(selectedNode.config.failOnError ?? true)}
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    config: { failOnError: event.target.checked },
                  })
                }
              />
              Fail Run On Validation Error
            </label>
          </>
        )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
