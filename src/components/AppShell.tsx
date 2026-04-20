"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
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
  const pathname = usePathname();
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

  function navClass(href: string) {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return `app-nav-link ${active ? "app-nav-link-active" : ""}`;
  }

  return (
    <div className="min-h-screen bg-app-bg transition-colors">
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-surface/95 backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <Link href="/" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-app-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg">
              <BrandLogo variant="header" priority />
              <div className="flex flex-col border-l border-app-border pl-3">
                <span className="text-lg font-bold leading-tight text-app-text">HR System</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-app-primary">Pinamungajan</span>
              </div>
            </Link>

            <nav className="flex flex-wrap items-center gap-1 text-sm sm:gap-1" aria-label="Main">
              {canUpload ? (
                <Link className={navClass("/upload")} href="/upload">
                  <PlusCircle className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Add document</span>
                </Link>
              ) : null}
              {canReview ? (
                <Link className={navClass("/review")} href="/review">
                  <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Reviews</span>
                </Link>
              ) : null}
              <Link className={navClass("/masterlist")} href="/masterlist">
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                <span>Masterlist</span>
              </Link>
              {isAdmin ? (
                <Link className={navClass("/admin")} href="/admin">
                  <Shield className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Admin</span>
                </Link>
              ) : null}
              <Link className={navClass("/settings")} href="/settings">
                <Settings className="h-4 w-4 shrink-0" aria-hidden />
                <span>Settings</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="app-btn-ghost rounded-full p-2"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <header className="border-b border-app-border pb-6">
          <p className="app-eyebrow">LGU Pinamungajan · Human resources</p>
          <h1 className="app-section-title mt-3">{title}</h1>
        </header>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
