"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAdminPath, getAdminLoginPath, isAdminAppPath } from "@/lib/urls";
import { BrandLogo } from "@/components/BrandLogo";
import { Mail, KeyRound, Eye, EyeOff, LogIn, Shield } from "lucide-react";

function createWaitForSignedIn(supabase: ReturnType<typeof createSupabaseBrowserClient>) {
  return () =>
    new Promise<void>((resolve) => {
      let done = false;
      let authSub: { unsubscribe: () => void } | null = null;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        authSub?.unsubscribe();
        resolve();
      }, 1200);

      const sub = supabase.auth.onAuthStateChange((event) => {
        if (done) return;
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          done = true;
          window.clearTimeout(timer);
          authSub?.unsubscribe();
          resolve();
        }
      });

      authSub = sub?.data?.subscription ?? null;
    });
}

type LoginViewMode = "staff" | "admin";

export function LoginView({ mode }: { mode: LoginViewMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminPath = getAdminPath();

  const nextPath = (() => {
    const raw = searchParams.get("next");
    if (mode === "admin") {
      if (!raw || raw === getAdminLoginPath() || raw === "/login") return adminPath;
      if (!raw.startsWith("/")) return adminPath;
      return raw;
    }
    if (!raw || raw === "/login") return "/";
    if (!raw.startsWith("/")) return "/";
    return raw;
  })();

  const isAdminLogin = mode === "admin" || isAdminAppPath(nextPath);
  const staffLoginHref = searchParams.get("next") && mode === "admin" ? "/login" : "/";

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const waitForSignedIn = useMemo(() => createWaitForSignedIn(supabase), [supabase]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idPrefix = mode === "admin" ? "admin" : "staff";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let res: Response;
      try {
        res = await fetch("/api/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
      } catch (fetchErr) {
        setError(
          fetchErr instanceof TypeError
            ? "Could not reach this app (network or server). If you use a blocker, allow this site; ensure the dev server is running."
            : "Login failed"
        );
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Login failed");
        return;
      }

      await supabase.auth.getSession();
      await waitForSignedIn();
      router.replace(nextPath);
      router.refresh();
      window.setTimeout(() => {
        if (window.location.pathname !== nextPath) window.location.href = nextPath;
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const primaryCta = isAdminLogin
    ? "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 disabled:pointer-events-none disabled:opacity-50 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 dark:focus-visible:ring-amber-300/50 dark:focus-visible:ring-offset-slate-900"
    : "app-btn-primary mt-2 w-full py-3 text-base font-semibold";

  return (
    <div
      className={
        isAdminLogin
          ? "flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200 p-4 sm:p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
          : "flex min-h-screen items-center justify-center bg-app-bg p-4 sm:p-6"
      }
    >
      <div
        className={
          isAdminLogin
            ? "w-full max-w-md rounded-2xl border border-amber-500/40 bg-app-surface p-8 shadow-lg shadow-amber-900/10 ring-1 ring-amber-500/25 dark:border-amber-400/30 dark:shadow-amber-950/30 dark:ring-amber-400/20"
            : "app-card w-full max-w-md p-8 shadow-md"
        }
      >
        <div className="flex flex-col items-center text-center">
          {isAdminLogin ? (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
              <Shield className="h-4 w-4 shrink-0" aria-hidden />
              Administrator
            </div>
          ) : null}
          <div className="mb-6 drop-shadow-sm">
            <BrandLogo variant="hero" priority />
          </div>
          <h1
            className={
              isAdminLogin
                ? "text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50"
                : "text-2xl font-bold leading-tight text-app-text"
            }
          >
            {isAdminLogin ? "Admin sign-in" : "HR document system"}
          </h1>
          <p
            className={
              isAdminLogin
                ? "mt-2 max-w-sm text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400"
                : "app-prose-muted mt-2 text-center"
            }
          >
            {isAdminLogin
              ? "Restricted access for system administrators. Use the account issued to your office."
              : "Sign in to manage employee records, uploads, and reviews."}
          </p>
        </div>

        {isAdminLogin ? (
          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-500">
            <Link
              href={staffLoginHref}
              className="font-medium text-amber-800 underline decoration-amber-500/50 underline-offset-2 transition-colors hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
            >
              Staff or HR sign-in (not admin)
            </Link>
          </p>
        ) : null}

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <div>
            <label htmlFor={`${idPrefix}-email`} className="text-sm font-semibold text-app-text">
              Email address
            </label>
            <div className="relative mt-1.5 flex items-center">
              <Mail className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" aria-hidden />
              <input
                id={`${idPrefix}-email`}
                className="app-input pl-10"
                type="email"
                placeholder="you@example.gov.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${idPrefix}-err` : undefined}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${idPrefix}-password`} className="text-sm font-semibold text-app-text">
              Password
            </label>
            <div className="relative mt-1.5 flex items-center">
              <KeyRound className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" aria-hidden />
              <input
                id={`${idPrefix}-password`}
                className="app-input pl-10 pr-12"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${idPrefix}-err` : undefined}
              />
              <button
                type="button"
                className="absolute right-3 p-1 text-app-muted transition-colors hover:text-app-text"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div id={`${idPrefix}-err`} role="alert" className="app-alert-danger text-center text-sm font-medium">
              {error}
            </div>
          ) : null}

          <button type="submit" disabled={loading} className={primaryCta} aria-busy={loading}>
            {loading ? (
              isAdminLogin ? "Signing in to admin…" : "Signing in…"
            ) : (
              <>
                {isAdminLogin ? <Shield className="h-5 w-5" aria-hidden /> : <LogIn className="h-5 w-5" aria-hidden />}
                <span>{isAdminLogin ? "Sign in as administrator" : "Sign in"}</span>
              </>
            )}
          </button>
          <p className="text-center text-xs leading-relaxed text-app-muted">
            {isAdminLogin
              ? "Use only credentials issued to your office. Contact IT if you are locked out."
              : "Forgot your password? Ask your HR administrator to reset it in Supabase or your identity system."}
          </p>
        </form>
      </div>
    </div>
  );
}
