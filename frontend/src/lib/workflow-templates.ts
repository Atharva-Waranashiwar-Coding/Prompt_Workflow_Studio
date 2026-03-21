import { type WorkflowTemplateDefinition } from "@/types/workflow";

export const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: "support-triage",
    title: "Support Triage",
    description: "Prompt classification with true/false condition branching and final outputs.",
    tags: ["support", "triage"],
    nodes: [
      {
        id: "prompt-1",
        nodeType: "prompt",
        label: "Classify Request",
        position: { x: 120, y: 180 },
        config: {
          promptTemplate: "Classify this request as billing or general support. Input: {{run_input}}",
        },
      },
      {
        id: "condition-1",
        nodeType: "condition",
        label: "Billing Route?",
        position: { x: 410, y: 180 },
        config: {
          conditionExpression: "contains:billing",
        },
      },
      {
        id: "output-1",
        nodeType: "output",
        label: "Billing Output",
        position: { x: 700, y: 110 },
        config: {
          outputFormat: "json",
        },
      },
      {
        id: "output-2",
        nodeType: "output",
        label: "General Output",
        position: { x: 700, y: 250 },
        config: {
          outputFormat: "json",
        },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "prompt-1",
        target: "condition-1",
      },
      {
        id: "edge-2",
        source: "condition-1",
        target: "output-1",
        sourceHandle: "true",
        label: "TRUE",
        data: { branch: "true" },
      },
      {
        id: "edge-3",
        source: "condition-1",
        target: "output-2",
        sourceHandle: "false",
        label: "FALSE",
        data: { branch: "false" },
      },
    ],
  },
  {
    id: "tool-memory-loop",
    title: "Tool + Memory",
    description: "Fetch template, persist context, read memory, then output.",
    tags: ["tool", "memory"],
    nodes: [
      {
        id: "tool-1",
        nodeType: "tool",
        label: "Load Template",
        position: { x: 120, y: 180 },
        config: {
          toolName: "template_fetch",
          toolParams: { template_key: "default_support" },
        },
      },
      {
        id: "memory-write-1",
        nodeType: "memory_write",
        label: "Store Context",
        position: { x: 410, y: 180 },
        config: {
          memoryScope: "workflow",
          memoryKey: "last.template",
          valueTemplate: "{{last_output}}",
        },
      },
      {
        id: "memory-read-1",
        nodeType: "memory_read",
        label: "Read Context",
        position: { x: 700, y: 180 },
        config: {
          memoryScope: "workflow",
          memoryKey: "last.template",
          fallbackValue: "",
        },
      },
      {
        id: "output-1",
        nodeType: "output",
        label: "Response",
        position: { x: 990, y: 180 },
        config: {
          outputFormat: "json",
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "tool-1", target: "memory-write-1" },
      { id: "edge-2", source: "memory-write-1", target: "memory-read-1" },
      { id: "edge-3", source: "memory-read-1", target: "output-1" },
    ],
  },
  {
    id: "validated-output",
    title: "Validator Gate",
    description: "Prompt, then validate required fields before output.",
    tags: ["validator", "quality"],
    nodes: [
      {
        id: "prompt-1",
        nodeType: "prompt",
        label: "Generate Structured Result",
        position: { x: 120, y: 180 },
        config: {
          promptTemplate: "Generate JSON with fields: intent, confidence, answer",
        },
      },
      {
        id: "validator-1",
        nodeType: "validator",
        label: "Validate Payload",
        position: { x: 410, y: 180 },
        config: {
          targetPath: "last_output",
          requiredFields: ["intent", "answer"],
          schema: {
            required: ["intent", "answer"],
            properties: {
              intent: "string",
              answer: "string",
            },
          },
          rules: [{ type: "non-empty", path: "answer" }],
          failOnError: true,
        },
      },
      {
        id: "output-1",
        nodeType: "output",
        label: "Validated Output",
        position: { x: 700, y: 180 },
        config: {
          outputFormat: "json",
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "prompt-1", target: "validator-1" },
      { id: "edge-2", source: "validator-1", target: "output-1" },
    ],
  },
];
