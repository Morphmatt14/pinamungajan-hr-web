import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppRole } from "@/lib/auth/roles";

/**
 * Returns the current user and role from the HTTP-only session cookie.
 * Client components cannot always read Supabase session from the browser client
 * after server sign-in, so the shell uses this for nav (e.g. Admin link).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ user: null });
  }
  const u = data.user;
  return NextResponse.json({
    user: {
      id: u.id,
      email: u.email,
      role: getAppRole(u),
      approved: u.app_metadata?.approved === true,
    },
  });
}
