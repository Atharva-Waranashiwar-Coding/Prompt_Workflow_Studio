import { Database, FileCode, GitBranch, MonitorSmartphone, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";
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
  const insertTemplate = useWorkflowBuilderStore((state) => state.insertTemplate);
  const hasNodes = useWorkflowBuilderStore((state) => state.nodeOrder.length > 0);

  return (
    <div className="space-y-4">
      <Card>
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
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{option.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{option.description}</p>
                </div>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Starter Templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {WORKFLOW_TEMPLATES.map((template) => (
            <div key={template.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.title}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={readOnly}
                  onClick={() => insertTemplate(template, { replaceExisting: false })}
                >
                  Insert
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={readOnly || !hasNodes}
                  onClick={() => insertTemplate(template, { replaceExisting: true })}
                >
                  Replace
                </Button>
              </div>
            </div>
          ))}
          <div className="rounded-md border border-dashed border-slate-300 p-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Tip: Insert adds a reusable subflow block. Replace resets the canvas with the template.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
