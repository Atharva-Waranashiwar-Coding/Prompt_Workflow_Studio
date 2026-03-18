export type NodeType = "prompt" | "condition" | "output";

export type WorkflowNodeConfig = {
  promptTemplate?: string;
  conditionExpression?: string;
  outputFormat?: string;
  [key: string]: unknown;
};

export interface WorkflowNodeEntity {
  id: string;
  nodeType: NodeType;
  label: string;
  position: {
    x: number;
    y: number;
  };
  config: WorkflowNodeConfig;
}

export interface WorkflowEdgeEntity {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string | null;
  data?: Record<string, unknown> | null;
}

export interface WorkflowApiNode {
  id: string;
  node_type: NodeType;
  label: string;
  position_x: number;
  position_y: number;
  config: WorkflowNodeConfig;
}

export interface WorkflowApiEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  target_handle?: string | null;
  label?: string | null;
  data?: Record<string, unknown> | null;
}

export interface WorkflowRecord {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  nodes: WorkflowApiNode[];
  edges: WorkflowApiEdge[];
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowSavePayload {
  name: string;
  description: string | null;
  nodes: WorkflowApiNode[];
  edges: WorkflowApiEdge[];
}

export interface WorkflowReactNodeData {
  label: string;
  nodeType: NodeType;
  config: WorkflowNodeConfig;
}
