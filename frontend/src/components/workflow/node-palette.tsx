import { Database, FileCode, GitBranch, MonitorSmartphone, ShieldCheck, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useWorkflowBuilderStore } from "@/store/workflow-builder-store";

const nodeOptions = [
  {
    type: "prompt" as const,
    title: "Prompt",
    description: "Collect prompt template and model settings",
    icon: FileCode,
  },
  {
    type: "condition" as const,
    title: "Condition",
    description: "Branch based on expression or guard condition",
    icon: GitBranch,
  },
  {
    type: "output" as const,
    title: "Output",
    description: "Define final output shape for downstream systems",
    icon: MonitorSmartphone,
  },
  {
    type: "tool" as const,
    title: "Tool",
    description: "Invoke an MCP-exposed tool during execution",
    icon: Wrench,
  },
  {
    type: "memory_read" as const,
    title: "Memory Read",
    description: "Load scoped memory values into execution context",
    icon: Database,
  },
  {
    type: "memory_write" as const,
    title: "Memory Write",
    description: "Persist values to project/workflow/run memory",
    icon: Database,
  },
  {
    type: "validator" as const,
    title: "Validator",
    description: "Apply schema and rule checks to node outputs",
    icon: ShieldCheck,
  },
];

type NodePaletteProps = {
  readOnly?: boolean;
};

export function NodePalette({ readOnly = false }: NodePaletteProps) {
  const addNode = useWorkflowBuilderStore((state) => state.addNode);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Node Library</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {nodeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Button
              key={option.type}
              variant="secondary"
              className={cn("h-auto w-full justify-start gap-3 p-3 text-left", readOnly && "cursor-not-allowed opacity-60")}
              disabled={readOnly}
              onClick={() => addNode(option.type)}
            >
              <Icon className="h-4 w-4 text-brand-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">{option.title}</p>
                <p className="text-xs text-slate-500">{option.description}</p>
              </div>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
