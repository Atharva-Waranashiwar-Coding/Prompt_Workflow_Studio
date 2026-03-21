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
  type WorkflowTemplateDefinition,
} from "@/types/workflow";

type WorkflowTemplateInsertOptions = {
  replaceExisting?: boolean;
  anchor?: {
    x: number;
    y: number;
  };
};

type AddNodeOptions = {
  position?: {
    x: number;
    y: number;
  };
  label?: string;
  config?: WorkflowNodeConfig;
  select?: boolean;
};

type LayoutDirection = "LR" | "TB";

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
  addNode: (nodeType: NodeType, options?: AddNodeOptions) => void;
  deleteSelectedNode: () => void;
  duplicateSelectedNode: () => void;
  autoLayout: (direction?: LayoutDirection) => void;
  insertTemplate: (template: WorkflowTemplateDefinition, options?: WorkflowTemplateInsertOptions) => void;
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

const GRID_SIZE = 24;
const NODE_X_SPACING = 320;
const NODE_Y_SPACING = 170;

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function cloneConfig(config: WorkflowNodeConfig): WorkflowNodeConfig {
  try {
    return structuredClone(config);
  } catch {
    return JSON.parse(JSON.stringify(config)) as WorkflowNodeConfig;
  }
}

function normalizeNodeConfig(config: unknown): WorkflowNodeConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config as WorkflowNodeConfig;
}

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
      config: normalizeNodeConfig(node.config),
    },
  };
}

function reactFlowNodeToEntity(node: Node<WorkflowReactNodeData>): WorkflowNodeEntity {
  const nodeData = node.data ?? {
    label: "Node",
    nodeType: "output" as NodeType,
    config: {},
  };
  const nodeType = (node.type ?? nodeData.nodeType) as NodeType;
  return {
    id: node.id,
    nodeType,
    label: nodeData.label,
    position: node.position,
    config: normalizeNodeConfig(nodeData.config),
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

function isPersistedNodeChange(change: NodeChange): boolean {
  return change.type === "add" || change.type === "remove" || change.type === "position" || change.type === "reset";
}

function isPersistedEdgeChange(change: EdgeChange): boolean {
  return change.type === "add" || change.type === "remove" || change.type === "reset";
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
      config: normalizeNodeConfig(node.config),
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

  addNode: (nodeType, options) => {
    const state = get();
    const id = crypto.randomUUID();
    const index = state.nodeOrder.length;

    const defaultPosition = {
      x: snap(120 + (index % 3) * 220),
      y: snap(120 + Math.floor(index / 3) * 140),
    };

    const newNode: WorkflowNodeEntity = {
      id,
      nodeType,
      label: options?.label ?? NODE_LABELS[nodeType],
      position: {
        x: snap(options?.position?.x ?? defaultPosition.x),
        y: snap(options?.position?.y ?? defaultPosition.y),
      },
      config: options?.config ? cloneConfig(options.config) : defaultConfig(nodeType),
    };

    const shouldSelect = options?.select ?? true;
    set({
      nodesById: {
        ...state.nodesById,
        [id]: newNode,
      },
      nodeOrder: [...state.nodeOrder, id],
      selectedNodeId: shouldSelect ? id : state.selectedNodeId,
      isDirty: true,
    });
  },

  deleteSelectedNode: () => {
    const state = get();
    const selectedNodeId = state.selectedNodeId;
    if (!selectedNodeId) {
      return;
    }
    if (!state.nodesById[selectedNodeId]) {
      return;
    }

    const { [selectedNodeId]: _, ...nextNodesById } = state.nodesById;
    const nextNodeOrder = state.nodeOrder.filter((nodeId) => nodeId !== selectedNodeId);

    const nextEdges = state.edgeOrder
      .map((edgeId) => state.edgesById[edgeId])
      .filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId);
    const normalizedEdges = normalizeEdges(nextEdges);

    set({
      nodesById: nextNodesById,
      nodeOrder: nextNodeOrder,
      edgesById: normalizedEdges.edgesById,
      edgeOrder: normalizedEdges.edgeOrder,
      selectedNodeId: null,
      isDirty: true,
    });
  },

  duplicateSelectedNode: () => {
    const state = get();
    const selectedNodeId = state.selectedNodeId;
    if (!selectedNodeId) {
      return;
    }
    const sourceNode = state.nodesById[selectedNodeId];
    if (!sourceNode) {
      return;
    }

    get().addNode(sourceNode.nodeType, {
      label: `${sourceNode.label} Copy`,
      config: cloneConfig(sourceNode.config),
      position: {
        x: snap(sourceNode.position.x + 72),
        y: snap(sourceNode.position.y + 72),
      },
      select: true,
    });
  },

  autoLayout: (direction = "LR") => {
    const state = get();
    const nodeIds = [...state.nodeOrder];
    if (nodeIds.length === 0) {
      return;
    }

    const nodesById = state.nodesById;
    const outgoing = new Map<string, string[]>();
    const incomingCount = new Map<string, number>();
    for (const nodeId of nodeIds) {
      outgoing.set(nodeId, []);
      incomingCount.set(nodeId, 0);
    }

    for (const edgeId of state.edgeOrder) {
      const edge = state.edgesById[edgeId];
      if (!edge) {
        continue;
      }
      if (!nodesById[edge.source] || !nodesById[edge.target]) {
        continue;
      }
      outgoing.get(edge.source)?.push(edge.target);
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    }

    const queue = nodeIds.filter((nodeId) => (incomingCount.get(nodeId) ?? 0) === 0);
    const levels = new Map<string, number>();
    for (const nodeId of queue) {
      levels.set(nodeId, 0);
    }

    let cursor = 0;
    while (cursor < queue.length) {
      const nodeId = queue[cursor];
      cursor += 1;
      const level = levels.get(nodeId) ?? 0;
      for (const targetId of outgoing.get(nodeId) ?? []) {
        const previousLevel = levels.get(targetId) ?? 0;
        levels.set(targetId, Math.max(previousLevel, level + 1));
        incomingCount.set(targetId, (incomingCount.get(targetId) ?? 0) - 1);
        if ((incomingCount.get(targetId) ?? 0) === 0) {
          queue.push(targetId);
        }
      }
    }

    if (queue.length < nodeIds.length) {
      for (const [index, nodeId] of nodeIds.entries()) {
        levels.set(nodeId, levels.get(nodeId) ?? index);
      }
    }

    const groups = new Map<number, string[]>();
    for (const nodeId of nodeIds) {
      const level = levels.get(nodeId) ?? 0;
      const bucket = groups.get(level) ?? [];
      bucket.push(nodeId);
      groups.set(level, bucket);
    }

    const sortedLevels = [...groups.keys()].sort((a, b) => a - b);
    const nextNodesById = { ...nodesById };

    for (const level of sortedLevels) {
      const bucket = groups.get(level) ?? [];
      bucket.sort((a, b) => {
        const left = nodesById[a];
        const right = nodesById[b];
        return left.position.y - right.position.y || left.position.x - right.position.x;
      });

      bucket.forEach((nodeId, index) => {
        const x = direction === "LR" ? snap(120 + level * NODE_X_SPACING) : snap(120 + index * 260);
        const y = direction === "LR" ? snap(120 + index * NODE_Y_SPACING) : snap(120 + level * NODE_Y_SPACING);
        nextNodesById[nodeId] = {
          ...nextNodesById[nodeId],
          position: { x, y },
        };
      });
    }

    set({
      nodesById: nextNodesById,
      isDirty: true,
    });
  },

  insertTemplate: (template, options) => {
    const state = get();
    if (template.nodes.length === 0) {
      return;
    }
    const replaceExisting = options?.replaceExisting ?? false;

    const baseNodeOrder = replaceExisting ? [] : [...state.nodeOrder];
    const baseNodesById = replaceExisting ? ({} as Record<string, WorkflowNodeEntity>) : { ...state.nodesById };
    const baseEdgeOrder = replaceExisting ? [] : [...state.edgeOrder];
    const baseEdgesById = replaceExisting ? ({} as Record<string, WorkflowEdgeEntity>) : { ...state.edgesById };

    const offset =
      options?.anchor ??
      (() => {
        if (replaceExisting || baseNodeOrder.length === 0) {
          return { x: 120, y: 120 };
        }
        const rightMostX = Math.max(...baseNodeOrder.map((nodeId) => baseNodesById[nodeId].position.x));
        const topY = Math.min(...baseNodeOrder.map((nodeId) => baseNodesById[nodeId].position.y));
        return { x: snap(rightMostX + NODE_X_SPACING), y: snap(topY) };
      })();

    const minTemplateX = Math.min(...template.nodes.map((node) => node.position.x));
    const minTemplateY = Math.min(...template.nodes.map((node) => node.position.y));

    const idMap = new Map<string, string>();
    const insertedNodeIds: string[] = [];
    for (const templateNode of template.nodes) {
      const nextId = crypto.randomUUID();
      idMap.set(templateNode.id, nextId);
      insertedNodeIds.push(nextId);
      baseNodesById[nextId] = {
        id: nextId,
        nodeType: templateNode.nodeType,
        label: templateNode.label,
        position: {
          x: snap(offset.x + templateNode.position.x - minTemplateX),
          y: snap(offset.y + templateNode.position.y - minTemplateY),
        },
        config: cloneConfig(templateNode.config),
      };
      baseNodeOrder.push(nextId);
    }

    for (const templateEdge of template.edges) {
      const source = idMap.get(templateEdge.source);
      const target = idMap.get(templateEdge.target);
      if (!source || !target) {
        continue;
      }
      const edgeId = crypto.randomUUID();
      baseEdgesById[edgeId] = {
        id: edgeId,
        source,
        target,
        sourceHandle: templateEdge.sourceHandle ?? null,
        targetHandle: templateEdge.targetHandle ?? null,
        label: templateEdge.label ?? null,
        data: templateEdge.data ?? null,
      };
      baseEdgeOrder.push(edgeId);
    }

    const nextTags = replaceExisting
      ? (template.tags ?? [])
      : [...new Set([...state.tags, ...(template.tags ?? [])])];

    set({
      nodesById: baseNodesById,
      nodeOrder: baseNodeOrder,
      edgesById: baseEdgesById,
      edgeOrder: baseEdgeOrder,
      selectedNodeId: insertedNodeIds[0] ?? state.selectedNodeId,
      tags: nextTags,
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
    if (changes.length === 0) {
      return;
    }
    const relevantChanges = changes.filter((change) => isPersistedNodeChange(change));
    if (relevantChanges.length === 0) {
      return;
    }

    const state = get();
    const reactFlowNodes = state.nodeOrder.map((nodeId) => entityNodeToReactFlowNode(state.nodesById[nodeId]));
    const updatedNodes = applyNodeChanges(relevantChanges, reactFlowNodes).map((node) => reactFlowNodeToEntity(node));
    const normalized = normalizeNodes(updatedNodes);

    set({
      nodesById: normalized.nodesById,
      nodeOrder: normalized.nodeOrder,
      isDirty: true,
    });
  },

  onEdgesChange: (changes) => {
    if (changes.length === 0) {
      return;
    }
    const relevantChanges = changes.filter((change) => isPersistedEdgeChange(change));
    if (relevantChanges.length === 0) {
      return;
    }

    const state = get();
    const reactFlowEdges = state.edgeOrder.map((edgeId) => entityEdgeToReactFlowEdge(state.edgesById[edgeId]));
    const updatedEdges = applyEdgeChanges(relevantChanges, reactFlowEdges).map((edge) => reactFlowEdgeToEntity(edge));
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
    return state.nodeOrder
      .map((nodeId) => state.nodesById[nodeId])
      .filter((node): node is WorkflowNodeEntity => Boolean(node))
      .map((node) => entityNodeToReactFlowNode(node));
  },

  getReactFlowEdges: () => {
    const state = get();
    return state.edgeOrder
      .map((edgeId) => state.edgesById[edgeId])
      .filter((edge): edge is WorkflowEdgeEntity => Boolean(edge))
      .filter((edge) => Boolean(state.nodesById[edge.source]) && Boolean(state.nodesById[edge.target]))
      .map((edge) => entityEdgeToReactFlowEdge(edge));
  },

  toSavePayload: () => {
    const state = get();
    if (!state.workflowId) {
      return null;
    }

    const nodes = state.nodeOrder
      .map((nodeId) => state.nodesById[nodeId])
      .filter((node): node is WorkflowNodeEntity => Boolean(node))
      .map((node) => entityNodeToApiNode(node));

    const nodeIdSet = new Set(nodes.map((node) => node.id));
    const edges = state.edgeOrder
      .map((edgeId) => state.edgesById[edgeId])
      .filter((edge): edge is WorkflowEdgeEntity => Boolean(edge))
      .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
      .map((edge) => entityEdgeToApiEdge(edge));

    return {
      name: state.name,
      description: state.description || null,
      tags: state.tags,
      nodes,
      edges,
    };
  },
}));
