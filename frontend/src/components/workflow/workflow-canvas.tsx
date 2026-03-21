import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

import { cn } from "@/lib/utils";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";
import { type WorkflowReactNodeData } from "@/types/workflow";

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowReactNodeData>) {
  const palette = {
    prompt: "border-brand-300 bg-brand-50/80",
    condition: "border-amber-300 bg-amber-50/90",
    output: "border-emerald-300 bg-emerald-50/90",
    tool: "border-cyan-300 bg-cyan-50/90",
    memory_read: "border-violet-300 bg-violet-50/90",
    memory_write: "border-indigo-300 bg-indigo-50/90",
    validator: "border-rose-300 bg-rose-50/90",
  }[data.nodeType];

  const isCondition = data.nodeType === "condition";
  const isOutput = data.nodeType === "output";

  return (
    <div className={cn("min-w-48 rounded-lg border px-3 py-2 text-left shadow-sm", palette, selected && "ring-2 ring-brand-500")}>
      <Handle type="target" position={Position.Left} className="h-2 w-2 border border-white bg-slate-500" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{data.nodeType}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{data.label}</p>

      {!isOutput && !isCondition && (
        <Handle id="next" type="source" position={Position.Right} className="h-2 w-2 border border-white bg-slate-700" />
      )}

      {isCondition && (
        <>
          <div className="mt-2 flex justify-end gap-3 pr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>True</span>
            <span>False</span>
          </div>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="h-2 w-2 border border-white bg-emerald-600"
            style={{ top: "43%" }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="h-2 w-2 border border-white bg-rose-500"
            style={{ top: "73%" }}
          />
        </>
      )}
    </div>
  );
}

const nodeTypes = {
  prompt: WorkflowNodeCard,
  condition: WorkflowNodeCard,
  output: WorkflowNodeCard,
  tool: WorkflowNodeCard,
  memory_read: WorkflowNodeCard,
  memory_write: WorkflowNodeCard,
  validator: WorkflowNodeCard,
};

type WorkflowCanvasProps = {
  readOnly?: boolean;
};

export function WorkflowCanvas({ readOnly = false }: WorkflowCanvasProps) {
  const nodes = useWorkflowBuilderStore((state) => state.getReactFlowNodes());
  const edges = useWorkflowBuilderStore((state) => state.getReactFlowEdges());
  const onNodesChange = useWorkflowBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowBuilderStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowBuilderStore((state) => state.onConnect);
  const selectNode = useWorkflowBuilderStore((state) => state.selectNode);

  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-white/95">
      <ReactFlow
        nodes={nodes as Node<WorkflowReactNodeData>[]}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onPaneClick={() => selectNode(null)}
        onNodeClick={(_, node) => selectNode(node.id)}
      >
        <MiniMap className="!bg-white" />
        <Controls />
        <Background gap={24} size={1} color="#bae6fd" />
      </ReactFlow>
    </div>
  );
}
