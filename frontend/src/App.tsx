import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { ProjectsPage } from "@/pages/projects-page";
import { WorkflowBuilderPage } from "@/pages/workflow-builder-page";
import { WorkflowRunDetailPage } from "@/pages/workflow-run-detail-page";
import { WorkflowRunsPage } from "@/pages/workflow-runs-page";
import { WorkflowsPage } from "@/pages/workflows-page";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<WorkflowsPage />} />
        <Route path="/projects/:projectId/workflows/:workflowId" element={<WorkflowBuilderPage />} />
        <Route path="/projects/:projectId/workflows/:workflowId/runs" element={<WorkflowRunsPage />} />
        <Route path="/projects/:projectId/workflows/:workflowId/runs/:runId" element={<WorkflowRunDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
