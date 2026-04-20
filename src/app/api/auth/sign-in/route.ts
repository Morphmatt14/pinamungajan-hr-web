import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Password sign-in via server so the browser does not call Supabase directly
 * (same rationale as OTP routes — avoids "Failed to fetch" from blocked third-party requests).
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
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

  const result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  if (!result.data.session) {
    return NextResponse.json({ error: "Signed in but no session returned" }, { status: 500 });
  }

  return response;
}
