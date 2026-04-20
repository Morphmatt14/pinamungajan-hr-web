import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  let body: { email?: string; phone?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = emailRaw ? emailRaw.toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.replace(/\D/g, "") : "";

  if (!token) {
    return NextResponse.json({ error: "OTP code is required" }, { status: 400 });
  }
  if (!email && !phone) {
    return NextResponse.json({ error: "Email or phone is required" }, { status: 400 });
  }

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
    ? await supabase.auth.verifyOtp({ phone, token, type: "sms" })
    : await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  if (!result.data.session) {
    return NextResponse.json({ error: "Verified but no session returned" }, { status: 500 });
  }

  return response;
}
