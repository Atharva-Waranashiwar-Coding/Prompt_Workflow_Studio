import { Link } from "react-router-dom";

import { useAuthStore } from "@/store/auth-store";

export function TopNav() {
  const user = useAuthStore((state) => state.user);

  return (
    <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            PWS
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Prompt Workflow Studio</p>
            <p className="text-xs text-slate-500">Visual orchestration foundation</p>
          </div>
        </Link>

        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          {user?.displayName ?? "Local User"}
        </div>
      </div>
    </header>
  );
}
