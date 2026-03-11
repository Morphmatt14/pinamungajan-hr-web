"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { Mail, KeyRound, Eye, EyeOff, LogIn } from "lucide-react";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = (() => {
    const raw = searchParams.get("next");
    if (!raw || raw === "/login") return "/";
    if (!raw.startsWith("/")) return "/";
    return raw;
  })();

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const waitForSignedIn = () =>
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

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Defensive: ensure we actually received a session.
      if (!data.session) {
        setError("Signed in but no session returned. Check Supabase URL/Anon key and Auth settings.");
        return;
      }

      // Wait briefly for cookies/session propagation so middleware can see the session.
      await waitForSignedIn();
      router.replace(nextPath);
      router.refresh();
      // Fallback hard navigation in case the SPA navigation is blocked by middleware timing.
      window.setTimeout(() => {
        if (window.location.pathname !== nextPath) window.location.href = nextPath;
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md rounded-3xl border border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm transition-colors">
        <div className="flex flex-col items-center text-center">
          <img src="/logo.svg" alt="Pinamungajan Logo" className="h-20 w-20 object-contain drop-shadow-sm mb-4" />
          <h1 className="text-2xl font-bold text-blue-900 dark:text-blue-400 leading-tight">Pinamungajan HR</h1>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
            Please sign in to access employee records and review pending documents.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
            <div className="relative mt-1.5 flex items-center">
              <Mail className="absolute left-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-2.5 pl-10 pr-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-500"
                type="email"
                placeholder="hr@pinamungajan.gov.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative mt-1.5 flex items-center">
              <KeyRound className="absolute left-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
              <input
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-2.5 pl-10 pr-12 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm font-medium text-red-700 dark:text-red-400 text-center">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-70 disabled:hover:bg-blue-600"
          >
            {loading ? (
              "Signing in..."
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                <span>Secure Sign In</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6" />}
    >
      <LoginPageInner />
    </Suspense>
  );
}
