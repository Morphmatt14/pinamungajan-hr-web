"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import Image from "next/image";
import { Mail, KeyRound, Eye, EyeOff, LogIn, Smartphone, ShieldCheck } from "lucide-react";

const OTP_TTL_MS = 15 * 60 * 1000; // 15 minutes

function looksLikePhone(input: string) {
  return /^\+?[0-9]{10,15}$/.test(input.trim());
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

  async function onSendOtp() {
    const target = otpTarget.trim();
    if (!target) {
      setError("Enter your email or phone number first.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const isPhone = looksLikePhone(target);
      const result = isPhone
        ? await supabase.auth.signInWithOtp({
            phone: target,
            options: { shouldCreateUser: false },
          })
        : await supabase.auth.signInWithOtp({
            email: target,
            options: { shouldCreateUser: false },
          });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setOtpSentAt(Date.now());
      setInfo(`OTP sent to ${target}. Enter it within 15 minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const target = otpTarget.trim();
    const token = otpCode.trim();
    if (!target || !token) {
      setError("Enter your email/phone and OTP code.");
      return;
    }
    if (!otpSentAt || Date.now() - otpSentAt > OTP_TTL_MS) {
      setError("OTP expired after 15 minutes. Request a new code.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const isPhone = looksLikePhone(target);
      const { error } = await supabase.auth.verifyOtp(
        isPhone
          ? { phone: target, token, type: "sms" }
          : { email: target, token, type: "email" }
      );

      if (error) {
        setError(error.message);
        return;
      }

      // OTP is single-use on Supabase side. Clear local token state.
      setOtpCode("");
      setOtpSentAt(null);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-lg shadow-slate-200/50 dark:shadow-none transition-colors">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/pinamungajan-logo.png"
            alt="LGU Pinamungajan"
            width={220}
            height={80}
            className="h-20 w-auto max-w-[85vw] object-contain drop-shadow-sm mb-5"
            priority
          />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">HR Document System</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in to manage employee records, uploads, and reviews.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError(null);
              setInfo(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              mode === "password"
                ? "bg-blue-600 text-white"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              mode === "otp"
                ? "bg-blue-600 text-white"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            OTP (Email/Phone)
          </button>
        </div>

        {mode === "password" ? (
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
            <button
              type="button"
              disabled={loading}
              onClick={onGoogleSignIn}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Continue with Google
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={onVerifyOtp}>
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Email or Phone Number
              </label>
              <div className="relative mt-1.5 flex items-center">
                {looksLikePhone(otpTarget) ? (
                  <Smartphone className="absolute left-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                ) : (
                  <Mail className="absolute left-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                )}
                <input
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-2.5 pl-10 pr-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="user@email.com or +639XXXXXXXXX"
                  value={otpTarget}
                  onChange={(e) => setOtpTarget(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">OTP Code</label>
              <div className="relative mt-1.5 flex items-center">
                <ShieldCheck className="absolute left-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-2.5 pl-10 pr-3 text-sm tracking-[0.2em] transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Enter OTP"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                />
              </div>
            </div>

            {otpSentAt ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-700">
                OTP expires in{" "}
                {Math.max(0, Math.ceil((OTP_TTL_MS - (nowMs - otpSentAt)) / 1000))}s (15-minute limit)
              </div>
            ) : null}

            {info ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                {info}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm font-medium text-red-700 dark:text-red-400">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onSendOtp}
                disabled={loading || !otpTarget.trim()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Send OTP
              </button>
              <button
                type="submit"
                disabled={loading || !otpCode.trim()}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-70"
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
      fallback={<div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6" />}
    >
      <LoginPageInner />
    </Suspense>
  );
}
