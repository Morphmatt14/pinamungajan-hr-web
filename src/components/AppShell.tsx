"use client";

import Link from "next/link";
import Image from "next/image";
import { LogoutButton } from "@/components/LogoutButton";
import { PlusCircle, ClipboardCheck, Users, Settings, Sun, Moon, Shield } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAppRole } from "@/lib/auth/roles";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setRole(getAppRole(data.user));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = role === "admin";
  const canUpload = role !== "admin";
  const canReview = role === "admin";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm transition-colors">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/pinamungajan-logo.png"
                alt="LGU Pinamungajan"
                width={160}
                height={48}
                className="h-11 w-auto max-w-[200px] object-contain object-left"
                priority
              />
              <div className="flex flex-col border-l border-slate-200 pl-3 dark:border-slate-600">
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">HR System</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                  Pinamungajan
                </span>
              </div>
            </Link>

            <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 sm:gap-3">
              {canUpload ? (
                <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors" href="/upload">
                  <PlusCircle className="h-4 w-4" />
                  <span>Add Document</span>
                </Link>
              ) : null}
              {canReview ? (
                <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-400 transition-colors" href="/review">
                  <ClipboardCheck className="h-4 w-4" />
                  <span>Pending Reviews</span>
                </Link>
              ) : null}
              <Link className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400 transition-colors" href="/masterlist">
                <Users className="h-4 w-4" />
                <span>Masterlist</span>
              </Link>
              {isAdmin ? (
                <Link
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-800 dark:hover:text-violet-300 transition-colors"
                  href="/admin"
                >
                  <Shield className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              ) : null}
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

      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
              LGU Pinamungajan · Human Resources
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h1>
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
