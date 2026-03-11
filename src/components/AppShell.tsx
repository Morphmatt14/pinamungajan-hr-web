"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { PlusCircle, ClipboardCheck, Users, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <header className="border-b border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Link href="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="Pinamungajan Logo" className="h-10 w-10 object-contain" />
              <div className="flex flex-col">
                <span className="text-lg font-bold text-blue-900 dark:text-blue-400 leading-tight">Pinamungajan HR</span>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Human Resources</span>
              </div>
            </Link>

            <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 sm:gap-3">
              <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors" href="/upload">
                <PlusCircle className="h-4 w-4" />
                <span>Add Document</span>
              </Link>
              <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-400 transition-colors" href="/review">
                <ClipboardCheck className="h-4 w-4" />
                <span>Pending Reviews</span>
              </Link>
              <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400 transition-colors" href="/masterlist">
                <Users className="h-4 w-4" />
                <span>Masterlist</span>
              </Link>
              <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors" href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4 self-start sm:self-auto">
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
                title="Toggle Dark Mode"
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              HR Department
            </div>
            <h1 className="mt-3 text-lg font-semibold text-slate-900 sm:text-xl">{title}</h1>
          </div>
        </div>
        <div className="mt-5">{children}</div>
      </main>
    </div>
  );
}
