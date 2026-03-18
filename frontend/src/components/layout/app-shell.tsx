import { Outlet } from "react-router-dom";

import { TopNav } from "@/components/layout/top-nav";

export function AppShell() {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
