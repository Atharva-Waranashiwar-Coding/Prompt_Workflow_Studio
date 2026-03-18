import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";

export function NodeConfigPanel() {
  const selectedNodeId = useWorkflowBuilderStore((state) => state.selectedNodeId);
  const selectedNode = useWorkflowBuilderStore((state) =>
    state.selectedNodeId ? state.nodesById[state.selectedNodeId] : null,
  );
  const updateNode = useWorkflowBuilderStore((state) => state.updateNode);

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
      </CardContent>
    </Card>
  );
}
