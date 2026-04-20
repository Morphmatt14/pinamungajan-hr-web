import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends email/SMS OTP via Supabase from the server so the browser never calls
 * *.supabase.co directly (avoids blockers on third-party auth).
 *
 * Email: OTP code only — do NOT pass `emailRedirectTo`. Including it makes
 * Supabase prioritize magic-link behavior in the sent email. See:
 * https://supabase.com/docs/guides/auth/auth-email-passwordless#with-otp
 *
 * Dashboard: Authentication → Email Templates → Magic Link must show {{ .Token }}
 * (see `supabase/email-templates/magic-link-otp-only.html` in this repo).
 */
function friendlyOtpSendError(raw: string): string {
  const m = raw.toLowerCase();

  // GoTrue uses this message for any failed auth email send, including OTP — not “still magic link” in the app.
  if (
    m.includes("error sending magic link") ||
    m.includes("error sending confirmation email") ||
    m.includes("unable to send email") ||
    (m.includes("smtp") && m.includes("error"))
  ) {
    return (
      "Supabase could not send the sign-in email. (The dashboard often calls this a “magic link” even when you only use a 6-digit code.) " +
      "In Supabase: Authentication → Email → SMTP Settings — save a complete custom SMTP (e.g. Gmail: host smtp.gmail.com, port 587, username = full Gmail, password = Google App Password, not your normal password). " +
      "Or check Authentication → Logs for the exact SMTP error. Built-in email is rate-limited and may not deliver to all addresses."
    );
  }

  if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
    return (
      "Supabase is blocking new sign-ups for OTP. In the Supabase dashboard: Authentication → Providers → Email — " +
      "allow sign-ups, or only use OTP for emails that already have an account. " +
      "You can also set SUPABASE_OTP_EMAIL_ALLOW_SIGNUP=false after sign-ups are enabled globally."
    );
  }

  if (m.includes("rate limit") || m.includes("too many") || m.includes("seconds")) {
    return "Too many OTP requests. Wait a minute before trying again.";
  }

  if (m.includes("invalid") && m.includes("email")) {
    return "That email address is not accepted. Check for typos.";
  }

  if (m.includes("sms") && (m.includes("not configured") || m.includes("provider"))) {
    return "SMS OTP is not set up in this Supabase project (configure a phone provider).";
  }

  return raw;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  let body: { email?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = emailRaw ? emailRaw.toLowerCase() : "";

  if (!email && !phone) {
    return NextResponse.json({ error: "Email or phone is required" }, { status: 400 });
  }

  /**
   * When false, Supabase only sends email OTP if the user already exists.
   * Default true so new addresses can receive a code (pending approval still applies in this app).
   */
  const allowEmailSignup =
    (process.env.SUPABASE_OTP_EMAIL_ALLOW_SIGNUP || "true").trim().toLowerCase() !== "false";

  let response = NextResponse.json({ ok: true as const });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const result = phone
    ? await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      })
    : await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: allowEmailSignup,
          // No emailRedirectTo — required for OTP-by-code flow per Supabase docs (avoids magic-link email).
        },
      });

  if (result.error) {
    return NextResponse.json(
      { error: friendlyOtpSendError(result.error.message) },
      { status: 400 }
    );
  }

  return response;
}
