import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

export function TopNav() {
  const user = useAuthStore((state) => state.user);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("pws-theme");
    const nextTheme: "light" | "dark" =
      savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("pws-theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  return (
    <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-sm shadow-brand-700/40">
            PWS
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Prompt Workflow Studio</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Visual orchestration foundation</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-2 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  isActive && "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
                )
              }
            >
              Projects
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  isActive && "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
                )
              }
            >
              Dashboard
            </NavLink>
          </nav>
          <Button variant="ghost" size="sm" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {user?.displayName ?? "Local User"}
          </div>
        </div>
      </div>
    </header>
  );
}
