"use client";

import { Suspense } from "react";
import { LoginView } from "@/components/LoginView";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          <div
            className="w-full max-w-md animate-pulse rounded-2xl border border-amber-500/30 bg-app-surface p-10 shadow-lg"
            role="status"
            aria-label="Loading administrator sign-in"
          >
            <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-app-surface-muted" />
            <div className="mx-auto mb-2 h-7 w-48 rounded bg-app-surface-muted" />
            <div className="mx-auto h-4 w-64 max-w-full rounded bg-app-surface-muted" />
            <div className="mt-8 space-y-4">
              <div className="h-11 w-full rounded-xl bg-app-surface-muted" />
              <div className="h-11 w-full rounded-xl bg-app-surface-muted" />
              <div className="h-12 w-full rounded-xl bg-amber-600/30" />
            </div>
          </div>
        </div>
      }
    >
      <LoginView mode="admin" />
    </Suspense>
  );
}
