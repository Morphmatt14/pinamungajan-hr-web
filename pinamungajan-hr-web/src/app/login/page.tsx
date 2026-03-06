"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-800">
          Use the account created in Supabase Authentication.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="shrink-0 rounded-md border px-3 py-2 text-xs hover:bg-zinc-50"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
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
