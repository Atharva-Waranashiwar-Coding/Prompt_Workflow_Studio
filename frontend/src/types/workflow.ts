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

export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed";
export type WorkflowRunStepStatus = "running" | "completed" | "failed";

export interface WorkflowRunStepRecord {
  id: string;
  run_id: string;
  step_index: number;
  node_id: string;
  node_type: string;
  node_label: string;
  status: WorkflowRunStepStatus;
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  triggered_by_user_id: string | null;
  status: WorkflowRunStatus;
  error_message: string | null;
  result_payload: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowRunDetailRecord extends WorkflowRunRecord {
  steps: WorkflowRunStepRecord[];
}

export interface WorkflowRunTriggerPayload {
  input_payload?: Record<string, unknown>;
}
