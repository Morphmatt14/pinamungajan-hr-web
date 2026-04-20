"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { BrandLogo } from "@/components/BrandLogo";
import { Mail, KeyRound, Eye, EyeOff, LogIn, Smartphone, ShieldCheck } from "lucide-react";

const OTP_DISPLAY_TTL_MS = 60 * 60 * 1000; // show countdown up to 1h (Supabase default OTP validity is often 3600s)

function looksLikePhone(input: string) {
  return /^\+?[0-9]{10,15}$/.test(input.trim());
}

function normalizeOtpTarget(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  if (looksLikePhone(t)) return t;
  return t.toLowerCase();
}

function parseOtpDigits(raw: string) {
  return raw.replace(/\D/g, "");
}

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
  const waitForSignedIn = useMemo(() => createWaitForSignedIn(supabase), [supabase]);

  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [otpTarget, setOtpTarget] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  useEffect(() => {
    if (!otpSentAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [otpSentAt]);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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

  async function onSendOtp() {
    const target = normalizeOtpTarget(otpTarget);
    if (!target) {
      setError("Enter your email or phone number first.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const isPhone = looksLikePhone(target);
      let res: Response;
      try {
        res = await fetch("/api/auth/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(isPhone ? { phone: target } : { email: target }),
        });
      } catch (fetchErr) {
        setError(
          fetchErr instanceof TypeError
            ? "Could not reach this app (network or server). Auth runs through your server so Supabase is not blocked by the browser."
            : "Failed to send OTP"
        );
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Failed to send OTP");
        return;
      }

      setOtpSentAt(Date.now());
      setInfo(
        isPhone
          ? `OTP sent to ${target}. Enter the code from your SMS.`
          : `We sent a 6-digit code to ${target}. Enter it below (passwordless sign-in uses the code, not a link). Check spam if it is slow.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const target = normalizeOtpTarget(otpTarget);
    const token = parseOtpDigits(otpCode);
    if (!target || !token) {
      setError("Enter your email/phone and the 6-digit OTP code.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const isPhone = looksLikePhone(target);
      let res: Response;
      try {
        res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            isPhone ? { phone: target, token } : { email: target, token }
          ),
        });
      } catch (fetchErr) {
        setError(
          fetchErr instanceof TypeError
            ? "Could not reach this app (network or server)."
            : "OTP verification failed"
        );
        return;
      }

      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "OTP verification failed");
        return;
      }

      // OTP is single-use on Supabase side. Clear local token state.
      setOtpCode("");
      setOtpSentAt(null);

      await supabase.auth.getSession();
      await waitForSignedIn();
      router.replace(nextPath);
      router.refresh();
      window.setTimeout(() => {
        if (window.location.pathname !== nextPath) window.location.href = nextPath;
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}${nextPath}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setError(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg p-4 sm:p-6">
      <div className="app-card w-full max-w-md p-8 shadow-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 drop-shadow-sm">
            <BrandLogo variant="hero" priority />
          </div>
          <h1 className="text-2xl font-bold leading-tight text-app-text">HR document system</h1>
          <p className="app-prose-muted mt-2 text-center">Sign in to manage employee records, uploads, and reviews.</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-app-border bg-app-surface-muted p-1">
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError(null);
              setInfo(null);
            }}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              mode === "password"
                ? "bg-app-primary text-app-on-primary shadow-sm"
                : "text-app-muted hover:bg-app-surface hover:text-app-text"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("otp");
              setError(null);
              setInfo(null);
            }}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              mode === "otp"
                ? "bg-app-primary text-app-on-primary shadow-sm"
                : "text-app-muted hover:bg-app-surface hover:text-app-text"
            }`}
          >
            OTP (email / phone)
          </button>
        </div>

        {mode === "password" ? (
          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="text-sm font-semibold text-app-text">Email address</label>
              <div className="relative mt-1.5 flex items-center">
                <Mail className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" />
                <input
                  className="app-input pl-10"
                  type="email"
                  placeholder="hr@pinamungajan.gov.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-app-text">Password</label>
              <div className="relative mt-1.5 flex items-center">
                <KeyRound className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" />
                <input
                  className="app-input pl-10 pr-12"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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

            {error ? <div className="app-alert-danger text-center font-medium">{error}</div> : null}

            <button type="submit" disabled={loading} className="app-btn-primary mt-2 w-full py-3 text-base font-semibold">
              {loading ? (
                "Signing in..."
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  <span>Secure Sign In</span>
                </>
              )}
            </button>
            <button type="button" disabled={loading} onClick={onGoogleSignIn} className="app-btn-secondary w-full py-3">
              Continue with Google
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={onVerifyOtp}>
            <div>
              <label className="text-sm font-semibold text-app-text">Email or phone number</label>
              <div className="relative mt-1.5 flex items-center">
                {looksLikePhone(otpTarget) ? (
                  <Smartphone className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" />
                ) : (
                  <Mail className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" />
                )}
                <input
                  className="app-input pl-10"
                  placeholder="user@email.com or +639XXXXXXXXX"
                  value={otpTarget}
                  onChange={(e) => setOtpTarget(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-app-text">OTP code</label>
              <div className="relative mt-1.5 flex items-center">
                <ShieldCheck className="pointer-events-none absolute left-3 h-5 w-5 text-app-muted" />
                <input
                  className="app-input pl-10 tracking-[0.2em]"
                  placeholder="Enter OTP"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                />
              </div>
            </div>

            {otpSentAt ? (
              <div className="app-alert-info text-xs font-medium">
                ~{Math.max(0, Math.ceil((OTP_DISPLAY_TTL_MS - (nowMs - otpSentAt)) / 1000))}s left to enter your code
              </div>
            ) : null}

            {info ? (
              <div className="rounded-xl border border-app-success/30 bg-app-success-muted p-3 text-sm font-medium text-app-success">
                {info}
              </div>
            ) : null}
            {error ? <div className="app-alert-danger font-medium">{error}</div> : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onSendOtp}
                disabled={loading || !otpTarget.trim()}
                className="app-btn-secondary py-3 text-sm"
              >
                Send OTP
              </button>
              <button
                type="submit"
                disabled={loading || !otpCode.trim()}
                className="app-btn-primary py-3 text-sm font-semibold"
              >
                Verify OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center bg-app-bg p-6 text-app-muted">Loading…</div>}
    >
      <LoginPageInner />
    </Suspense>
  );
}
