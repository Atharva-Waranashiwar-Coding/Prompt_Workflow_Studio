export type NodeType = "prompt" | "condition" | "output" | "tool" | "memory_read" | "memory_write" | "validator";

export type MemoryScope = "project" | "workflow" | "run";
export type ValidatorRuleType = "contains" | "equals" | "non-empty";

export interface ValidatorRule {
  type: ValidatorRuleType;
  path?: string;
  value?: unknown;
}

export interface ValidatorSchema {
  required?: string[];
  properties?: Record<string, "string" | "number" | "boolean" | "object" | "array">;
}

export type WorkflowNodeConfig = {
  promptTemplate?: string;
  conditionExpression?: string;
  outputFormat?: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  memoryScope?: MemoryScope;
  memoryKey?: string;
  fallbackValue?: unknown;
  valueTemplate?: unknown;
  targetPath?: string;
  requiredFields?: string[];
  schema?: ValidatorSchema;
  rules?: ValidatorRule[];
  failOnError?: boolean;
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
  input_payload: unknown | null;
  output_payload: unknown | null;
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
  result_payload: unknown | null;
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

export interface WorkflowRunStepRetryPayload {
  input_payload?: Record<string, unknown>;
}

export interface ToolDefinitionRecord {
  name: string;
  title: string;
  description: string;
  parameter_schema: Record<string, unknown>;
  default_params: Record<string, unknown>;
}
