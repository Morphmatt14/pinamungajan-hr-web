import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/auth/roles";
import { randomBytes } from "node:crypto";

type AdminUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  app_metadata?: { role?: string; approved?: boolean };
  last_sign_in_at?: string | null;
  identities?: Array<{ provider?: string }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: jsonError("Unauthorized", 401) };
  if (!isAdminUser(user)) return { ok: false as const, response: jsonError("Forbidden", 403) };
  return { ok: true as const, user };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return jsonError(error.message, 400);

  const users = ((data?.users || []) as AdminUser[]).map((u) => ({
    id: u.id,
    email: u.email ?? null,
    phone: u.phone ?? null,
    role: String(u.app_metadata?.role || ""),
    approved: Boolean(u.app_metadata?.approved === true),
    last_sign_in_at: u.last_sign_in_at || null,
    providers: (u.identities || []).map((i) => String(i.provider || "")).filter(Boolean),
  }));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const requestedPassword = String(body.password || "").trim();
  const password = requestedPassword || `HrStaff!${randomBytes(5).toString("hex")}A1`;

  if (!email) {
    return jsonError(
      "Enter a work email address. HR staff accounts use real mailboxes so OTP and password reset can be delivered. " +
        "Auto-generated placeholder addresses are reserved for masterlist (employee) records, not for auth users.",
      400
    );
  }
  if (!isValidEmailFormat(email)) {
    return jsonError("Invalid email address format.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return jsonError(listErr.message, 400);

  const existing = (listData?.users || []).find((u) => String(u.email || "").toLowerCase() === email);
  if (existing) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata || {}), role: "hr", approved: true },
      ...(requestedPassword ? { password } : {}),
    });
    if (updateErr) return jsonError(updateErr.message, 400);
    return NextResponse.json({
      ok: true,
      mode: "updated",
      email,
      generatedPassword: requestedPassword ? password : null,
    });
  }

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "hr", approved: true },
  });
  if (createErr) return jsonError(createErr.message, 400);

  return NextResponse.json({
    ok: true,
    mode: "created",
    email,
    generatedPassword: requestedPassword ? null : password,
  });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) return jsonError("Missing user_id", 400);
  if (userId === guard.user.id) return jsonError("Cannot delete your own admin account", 400);

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) return jsonError(userErr?.message || "User not found", 404);
  if (String(userData.user.app_metadata?.role || "") === "admin") {
    return jsonError("Cannot delete another admin from this panel", 400);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return jsonError(delErr.message, 400);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { user_id?: string; action?: "approve" | "revoke"; role?: "hr" | "admin" | "" };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const userId = String(body.user_id || "").trim();
  const action = body.action || "approve";
  const targetRole = body.role === "admin" ? "admin" : body.role === "hr" ? "hr" : "hr";
  if (!userId) return jsonError("Missing user_id", 400);
  if (userId === guard.user.id) return jsonError("Cannot change your own admin approval here", 400);

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) return jsonError(userErr?.message || "User not found", 404);

  const currentMeta = userData.user.app_metadata || {};
  const nextMeta =
    action === "approve"
      ? { ...currentMeta, role: targetRole, approved: true }
      : { ...currentMeta, approved: false };

  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMeta,
  });
  if (upErr) return jsonError(upErr.message, 400);
  const meta = nextMeta as { role?: string };
  return NextResponse.json({ ok: true, action, role: meta.role || "" });
}
