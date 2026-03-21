import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow";

import {
  type NodeType,
  type WorkflowApiEdge,
  type WorkflowApiNode,
  type WorkflowEdgeEntity,
  type WorkflowNodeConfig,
  type WorkflowNodeEntity,
  type WorkflowReactNodeData,
  type WorkflowRecord,
  type WorkflowSavePayload,
} from "@/types/workflow";

export type WorkflowBuilderState = {
  workflowId: string | null;
  projectId: string | null;
  name: string;
  description: string;
  tags: string[];
  nodesById: Record<string, WorkflowNodeEntity>;
  nodeOrder: string[];
  edgesById: Record<string, WorkflowEdgeEntity>;
  edgeOrder: string[];
  selectedNodeId: string | null;
  isDirty: boolean;
  initializeFromWorkflow: (workflow: WorkflowRecord) => void;
  clear: () => void;
  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (description: string) => void;
  setWorkflowTags: (tags: string[]) => void;
  addNode: (nodeType: NodeType) => void;
  updateNode: (nodeId: string, patch: Partial<Pick<WorkflowNodeEntity, "label" | "config">>) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (nodeId: string | null) => void;
  getReactFlowNodes: () => Node<WorkflowReactNodeData>[];
  getReactFlowEdges: () => Edge[];
  toSavePayload: () => WorkflowSavePayload | null;
};

const NODE_LABELS: Record<NodeType, string> = {
  prompt: "Prompt Node",
  condition: "Condition Node",
  output: "Output Node",
  tool: "Tool Node",
  memory_read: "Memory Read Node",
  memory_write: "Memory Write Node",
  validator: "Validator Node",
};

function defaultConfig(nodeType: NodeType): WorkflowNodeConfig {
  if (nodeType === "prompt") {
    return { promptTemplate: "Generate a response based on the current context." };
  }
  if (nodeType === "condition") {
    return { conditionExpression: "true" };
  }
  if (nodeType === "tool") {
    return {
      toolName: "template_fetch",
      toolParams: { template_key: "default_support" },
    };
  }
  if (nodeType === "memory_read") {
    return {
      memoryScope: "workflow",
      memoryKey: "session.summary",
      fallbackValue: "",
    };
  }
  if (nodeType === "memory_write") {
    return {
      memoryScope: "workflow",
      memoryKey: "session.summary",
      valueTemplate: "{{last_output}}",
    };
  }
  if (nodeType === "validator") {
    return {
      targetPath: "last_output",
      requiredFields: [],
      schema: {
        required: [],
        properties: {},
      },
      rules: [
        {
          type: "non-empty",
        },
      ],
      failOnError: true,
    };
  }
  return { outputFormat: "text" };
}

function normalizeNodes(nodes: WorkflowNodeEntity[]): {
  nodesById: Record<string, WorkflowNodeEntity>;
  nodeOrder: string[];
} {
  const nodesById: Record<string, WorkflowNodeEntity> = {};
  const nodeOrder: string[] = [];

  for (const node of nodes) {
    nodesById[node.id] = node;
    nodeOrder.push(node.id);
  }

  return { nodesById, nodeOrder };
}

function normalizeEdges(edges: WorkflowEdgeEntity[]): {
  edgesById: Record<string, WorkflowEdgeEntity>;
  edgeOrder: string[];
} {
  const edgesById: Record<string, WorkflowEdgeEntity> = {};
  const edgeOrder: string[] = [];

  for (const edge of edges) {
    edgesById[edge.id] = edge;
    edgeOrder.push(edge.id);
  }

  return { edgesById, edgeOrder };
}

function entityNodeToReactFlowNode(node: WorkflowNodeEntity): Node<WorkflowReactNodeData> {
  return {
    id: node.id,
    type: node.nodeType,
    position: node.position,
    data: {
      label: node.label,
      nodeType: node.nodeType,
      config: node.config,
    },
  };
}

function reactFlowNodeToEntity(node: Node<WorkflowReactNodeData>): WorkflowNodeEntity {
  const nodeType = (node.type ?? node.data.nodeType) as NodeType;
  return {
    id: node.id,
    nodeType,
    label: node.data.label,
    position: node.position,
    config: node.data.config,
  };
}

function entityEdgeToReactFlowEdge(edge: WorkflowEdgeEntity): Edge {
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

function reactFlowEdgeToEntity(edge: Edge): WorkflowEdgeEntity {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    label: typeof edge.label === "string" ? edge.label : null,
    data: (edge.data as Record<string, unknown> | undefined) ?? null,
  };
}

function entityNodeToApiNode(node: WorkflowNodeEntity): WorkflowApiNode {
  return {
    id: node.id,
    node_type: node.nodeType,
    label: node.label,
    position_x: node.position.x,
    position_y: node.position.y,
    config: node.config,
  };
}

function entityEdgeToApiEdge(edge: WorkflowEdgeEntity): WorkflowApiEdge {
  return {
    id: edge.id,
    source_node_id: edge.source,
    target_node_id: edge.target,
    source_handle: edge.sourceHandle ?? null,
    target_handle: edge.targetHandle ?? null,
    label: edge.label ?? null,
    data: edge.data ?? null,
  };
}

const initialState = {
  workflowId: null,
  projectId: null,
  name: "",
  description: "",
  tags: [] as string[],
  nodesById: {} as Record<string, WorkflowNodeEntity>,
  nodeOrder: [] as string[],
  edgesById: {} as Record<string, WorkflowEdgeEntity>,
  edgeOrder: [] as string[],
  selectedNodeId: null,
  isDirty: false,
};

export const useWorkflowBuilderStore = create<WorkflowBuilderState>((set, get) => ({
  ...initialState,

  initializeFromWorkflow: (workflow) => {
    const nodes: WorkflowNodeEntity[] = workflow.nodes.map((node) => ({
      id: node.id,
      nodeType: node.node_type,
      label: node.label,
      position: { x: node.position_x, y: node.position_y },
      config: node.config ?? {},
    }));
    const edges: WorkflowEdgeEntity[] = workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      sourceHandle: edge.source_handle ?? null,
      targetHandle: edge.target_handle ?? null,
      label: edge.label ?? null,
      data: edge.data ?? null,
    }));

    const normalizedNodes = normalizeNodes(nodes);
    const normalizedEdges = normalizeEdges(edges);

    set({
      workflowId: workflow.id,
      projectId: workflow.project_id,
      name: workflow.name,
      description: workflow.description ?? "",
      tags: workflow.tags ?? [],
      nodesById: normalizedNodes.nodesById,
      nodeOrder: normalizedNodes.nodeOrder,
      edgesById: normalizedEdges.edgesById,
      edgeOrder: normalizedEdges.edgeOrder,
      selectedNodeId: null,
      isDirty: false,
    });
  },

  clear: () => {
    set({ ...initialState });
  },

  setWorkflowName: (name) => {
    set({ name, isDirty: true });
  },

  setWorkflowDescription: (description) => {
    set({ description, isDirty: true });
  },

  setWorkflowTags: (tags) => {
    const normalized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag, index, array) => Boolean(tag) && array.indexOf(tag) === index);
    set({ tags: normalized, isDirty: true });
  },

  addNode: (nodeType) => {
    const state = get();
    const id = crypto.randomUUID();
    const index = state.nodeOrder.length;

    const newNode: WorkflowNodeEntity = {
      id,
      nodeType,
      label: NODE_LABELS[nodeType],
      position: {
        x: 120 + (index % 3) * 220,
        y: 120 + Math.floor(index / 3) * 140,
      },
      config: defaultConfig(nodeType),
    };

    set({
      nodesById: {
        ...state.nodesById,
        [id]: newNode,
      },
      nodeOrder: [...state.nodeOrder, id],
      selectedNodeId: id,
      isDirty: true,
    });
  },

  updateNode: (nodeId, patch) => {
    const state = get();
    const current = state.nodesById[nodeId];
    if (!current) {
      return;
    }

    const nextNode: WorkflowNodeEntity = {
      ...current,
      ...patch,
      config: patch.config ? { ...current.config, ...patch.config } : current.config,
    };

    set({
      nodesById: {
        ...state.nodesById,
        [nodeId]: nextNode,
      },
      isDirty: true,
    });
  },

  onNodesChange: (changes) => {
    const state = get();
    const reactFlowNodes = state.nodeOrder.map((nodeId) => entityNodeToReactFlowNode(state.nodesById[nodeId]));
    const updatedNodes = applyNodeChanges(changes, reactFlowNodes).map((node) => reactFlowNodeToEntity(node));
    const normalized = normalizeNodes(updatedNodes);

    set({
      nodesById: normalized.nodesById,
      nodeOrder: normalized.nodeOrder,
      isDirty: true,
    });
  },

  onEdgesChange: (changes) => {
    const state = get();
    const reactFlowEdges = state.edgeOrder.map((edgeId) => entityEdgeToReactFlowEdge(state.edgesById[edgeId]));
    const updatedEdges = applyEdgeChanges(changes, reactFlowEdges).map((edge) => reactFlowEdgeToEntity(edge));
    const normalized = normalizeEdges(updatedEdges);

    set({
      edgesById: normalized.edgesById,
      edgeOrder: normalized.edgeOrder,
      isDirty: true,
    });
  },

  onConnect: (connection) => {
    const state = get();
    if (!connection.source || !connection.target) {
      return;
    }

    const branchHandle =
      connection.sourceHandle === "true" || connection.sourceHandle === "false"
        ? connection.sourceHandle
        : null;

    const reactFlowEdges = state.edgeOrder.map((edgeId) => entityEdgeToReactFlowEdge(state.edgesById[edgeId]));
    const nextEdges = addEdge(
      {
        ...connection,
        id: crypto.randomUUID(),
        label: branchHandle ? branchHandle.toUpperCase() : undefined,
        data: branchHandle ? { branch: branchHandle } : undefined,
      },
      reactFlowEdges,
    ).map((edge) => reactFlowEdgeToEntity(edge));

    const normalized = normalizeEdges(nextEdges);
    set({
      edgesById: normalized.edgesById,
      edgeOrder: normalized.edgeOrder,
      isDirty: true,
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  getReactFlowNodes: () => {
    const state = get();
    return state.nodeOrder.map((nodeId) => entityNodeToReactFlowNode(state.nodesById[nodeId]));
  },

  getReactFlowEdges: () => {
    const state = get();
    return state.edgeOrder.map((edgeId) => entityEdgeToReactFlowEdge(state.edgesById[edgeId]));
  },

  toSavePayload: () => {
    const state = get();
    if (!state.workflowId) {
      return null;
    }

    const nodes = state.nodeOrder.map((nodeId) => entityNodeToApiNode(state.nodesById[nodeId]));
    const edges = state.edgeOrder.map((edgeId) => entityEdgeToApiEdge(state.edgesById[edgeId]));

    return {
      name: state.name,
      description: state.description || null,
      tags: state.tags,
      nodes,
      edges,
    };
  },
}));
