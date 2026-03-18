import { FileCode, GitBranch, MonitorSmartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
];

export function NodePalette() {
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
              className="h-auto w-full justify-start gap-3 p-3 text-left"
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
