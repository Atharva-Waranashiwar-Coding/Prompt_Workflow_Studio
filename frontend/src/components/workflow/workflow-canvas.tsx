import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Node,
  type NodeProps,
} from "reactflow";
import { Copy, LayoutGrid, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import "reactflow/dist/style.css";

import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";
import {
  type WorkflowEdgeEntity,
  type WorkflowNodeEntity,
  type WorkflowReactNodeData,
} from "@/types/workflow";

function entityNodeToReactFlowNode(node: WorkflowNodeEntity): Node<WorkflowReactNodeData> {
  return {
    id: node.id,
    type: node.nodeType,
    position: node.position,
    data: {
      label: node.label,
      nodeType: node.nodeType,
      config: node.config ?? {},
    },
  };
}

function entityEdgeToReactFlowEdge(edge: WorkflowEdgeEntity) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label ?? undefined,
    data: edge.data ?? undefined,
  };
}

function previewNodeConfig(data: WorkflowReactNodeData): string {
  const config =
    data.config && typeof data.config === "object" && !Array.isArray(data.config)
      ? data.config
      : {};
  if (data.nodeType === "prompt") {
    return String(config.promptTemplate ?? "").slice(0, 36) || "Prompt template";
  }
  if (data.nodeType === "condition") {
    return String(config.conditionExpression ?? "").slice(0, 36) || "Condition rule";
  }
  if (data.nodeType === "tool") {
    return String(config.toolName ?? "Select tool");
  }
  if (data.nodeType === "memory_read" || data.nodeType === "memory_write") {
    return String(config.memoryKey ?? "memory.key");
  }
  if (data.nodeType === "validator") {
    return String(config.targetPath ?? "last_output");
  }
  return String(config.outputFormat ?? "text");
}

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowReactNodeData>) {
  const palette = {
    prompt: "border-brand-300 bg-brand-50/90 dark:border-brand-700 dark:bg-brand-950/60",
    condition: "border-amber-300 bg-amber-50/95 dark:border-amber-700 dark:bg-amber-950/60",
    output: "border-emerald-300 bg-emerald-50/95 dark:border-emerald-700 dark:bg-emerald-950/60",
    tool: "border-cyan-300 bg-cyan-50/95 dark:border-cyan-700 dark:bg-cyan-950/60",
    memory_read: "border-violet-300 bg-violet-50/95 dark:border-violet-700 dark:bg-violet-950/60",
    memory_write: "border-indigo-300 bg-indigo-50/95 dark:border-indigo-700 dark:bg-indigo-950/60",
    validator: "border-rose-300 bg-rose-50/95 dark:border-rose-700 dark:bg-rose-950/60",
  }[data.nodeType];

  const isCondition = data.nodeType === "condition";
  const isOutput = data.nodeType === "output";

  return (
    <div
      className={cn(
        "min-w-[220px] rounded-xl border px-3 py-2.5 text-left shadow-sm transition-shadow",
        "text-slate-900 dark:text-slate-100",
        palette,
        selected && "ring-2 ring-brand-500 shadow-lg shadow-brand-500/20",
      )}
    >
      <Handle type="target" position={Position.Left} className="h-2.5 w-2.5 border border-white bg-slate-500" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{data.nodeType}</p>
      </div>
      <p className="text-sm font-semibold">{data.label}</p>
      <p className="mt-1 truncate text-[11px] text-slate-600 dark:text-slate-300">{previewNodeConfig(data)}</p>

      {!isOutput && !isCondition && (
        <Handle id="next" type="source" position={Position.Right} className="h-2.5 w-2.5 border border-white bg-slate-700" />
      )}

      {isCondition && (
        <>
          <div className="mt-2 flex justify-end gap-4 pr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>True</span>
            <span>False</span>
          </div>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="h-2.5 w-2.5 border border-white bg-emerald-600"
            style={{ top: "45%" }}
          />
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            className="h-2.5 w-2.5 border border-white bg-rose-500"
            style={{ top: "74%" }}
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

type CanvasToolbarProps = {
  readOnly: boolean;
  hasNodes: boolean;
  onAutoLayout: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

function CanvasToolbar({ readOnly, hasNodes, onAutoLayout, onDelete, onDuplicate }: CanvasToolbarProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  return (
    <Panel position="top-left" className="m-2">
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
        <Button size="sm" variant="ghost" type="button" onClick={() => zoomOut()} title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => zoomIn()} title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => fitView({ padding: 0.22, duration: 220 })} title="Fit View">
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <Button size="sm" variant="ghost" type="button" disabled={!hasNodes || readOnly} onClick={onAutoLayout} title="Auto Layout (A)">
          Auto
        </Button>
        <Button size="sm" variant="ghost" type="button" disabled={!hasNodes || readOnly} onClick={onDuplicate} title="Duplicate Node (D)">
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" type="button" disabled={!hasNodes || readOnly} onClick={onDelete} title="Delete Node (Del)">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
  );
}

type WorkflowCanvasProps = {
  readOnly?: boolean;
};

export function WorkflowCanvas({ readOnly = false }: WorkflowCanvasProps) {
  const nodeOrder = useWorkflowBuilderStore((state) => state.nodeOrder);
  const nodesById = useWorkflowBuilderStore((state) => state.nodesById);
  const edgeOrder = useWorkflowBuilderStore((state) => state.edgeOrder);
  const edgesById = useWorkflowBuilderStore((state) => state.edgesById);
  const onNodesChange = useWorkflowBuilderStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowBuilderStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowBuilderStore((state) => state.onConnect);
  const selectNode = useWorkflowBuilderStore((state) => state.selectNode);
  const autoLayout = useWorkflowBuilderStore((state) => state.autoLayout);
  const deleteSelectedNode = useWorkflowBuilderStore((state) => state.deleteSelectedNode);
  const duplicateSelectedNode = useWorkflowBuilderStore((state) => state.duplicateSelectedNode);
  const insertTemplate = useWorkflowBuilderStore((state) => state.insertTemplate);

  const nodes = useMemo(
    () =>
      nodeOrder
        .map((nodeId) => nodesById[nodeId])
        .filter((node): node is WorkflowNodeEntity => Boolean(node))
        .map(entityNodeToReactFlowNode),
    [nodeOrder, nodesById],
  );

  const edges = useMemo(
    () =>
      edgeOrder
        .map((edgeId) => edgesById[edgeId])
        .filter((edge): edge is WorkflowEdgeEntity => Boolean(edge))
        .filter((edge) => Boolean(nodesById[edge.source]) && Boolean(nodesById[edge.target]))
        .map(entityEdgeToReactFlowEdge),
    [edgeOrder, edgesById, nodesById],
  );

  const hasNodes = nodes.length > 0;

  return (
    <div className="relative h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 dark:border-slate-700 dark:bg-slate-900/90">
      {!hasNodes && !readOnly && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white/95 p-4 text-center shadow-lg dark:border-slate-700 dark:bg-slate-900/95">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Start with a template or build from scratch</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Use the left node library, or insert a starter template to generate a complete graph.
            </p>
            <div className="pointer-events-auto mt-3">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => insertTemplate(WORKFLOW_TEMPLATES[0], { replaceExisting: true })}
              >
                Insert Starter Template
              </Button>
            </div>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes as Node<WorkflowReactNodeData>[]}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.3}
        maxZoom={1.8}
        snapToGrid
        snapGrid={[24, 24]}
        panOnScroll
        selectionOnDrag
        panOnDrag={[1, 2]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        elevateEdgesOnSelect
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { strokeWidth: 1.8, stroke: "#475569" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#475569", width: 16, height: 16 },
        }}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onPaneClick={() => selectNode(null)}
        onNodeClick={(_, node) => selectNode(node.id)}
      >
        <CanvasToolbar
          readOnly={readOnly}
          hasNodes={hasNodes}
          onAutoLayout={() => autoLayout("LR")}
          onDelete={deleteSelectedNode}
          onDuplicate={duplicateSelectedNode}
        />
        <MiniMap
          pannable
          zoomable
          className="!m-2 !rounded-lg !border !border-slate-200 !bg-white dark:!border-slate-700 dark:!bg-slate-900"
          nodeStrokeColor="#94a3b8"
          nodeColor="#e2e8f0"
          maskColor="rgba(15, 23, 42, 0.08)"
        />
        <Controls className="!m-2 !rounded-lg !border !border-slate-200 !bg-white dark:!border-slate-700 dark:!bg-slate-900" />
        <Background gap={24} size={1} color="#94a3b8" />
      </ReactFlow>
    </div>
  );
}
