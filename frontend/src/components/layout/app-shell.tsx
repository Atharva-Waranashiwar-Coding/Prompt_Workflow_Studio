import { Outlet } from "react-router-dom";

import { ErrorBoundary } from "@/components/common/error-boundary";
import { TopNav } from "@/components/layout/top-nav";

export function AppShell() {
  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100">
      <TopNav />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
