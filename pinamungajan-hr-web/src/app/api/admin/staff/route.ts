import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/auth/roles";
import { randomBytes } from "node:crypto";

type AdminUser = {
  id: string;
  email: string | null;
  app_metadata?: { role?: string; approved?: boolean };
  last_sign_in_at?: string | null;
  identities?: Array<{ provider?: string }>;
};

async function listAllUsers() {
  const admin = createSupabaseAdminClient();
  const users: AdminUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { users: [] as AdminUser[], error: error.message };
    const batch = (data?.users || []) as AdminUser[];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return { users, error: null as string | null };
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: new NextResponse("Unauthorized", { status: 401 }) };
  if (!isAdminUser(user)) return { ok: false as const, response: new NextResponse("Forbidden", { status: 403 }) };
  return { ok: true as const, user };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { users: allUsers, error } = await listAllUsers();
  if (error) return new NextResponse(error, { status: 400 });

  const users = allUsers.map((u) => ({
    id: u.id,
    email: u.email,
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
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return new NextResponse("Missing email", { status: 400 });
  const requestedPassword = String(body.password || "").trim();
  const password = requestedPassword || `HrStaff!${randomBytes(5).toString("hex")}A1`;

  const { users: allUsers, error: listErr } = await listAllUsers();
  if (listErr) return new NextResponse(listErr, { status: 400 });

  const existing = allUsers.find((u) => String(u.email || "").toLowerCase() === email);
  const admin = createSupabaseAdminClient();
  if (existing) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata || {}), role: "hr", approved: true },
      ...(requestedPassword ? { password } : {}),
    });
    if (updateErr) return new NextResponse(updateErr.message, { status: 400 });
    return NextResponse.json({ ok: true, mode: "updated", email, generatedPassword: requestedPassword ? null : null });
  }

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "hr", approved: true },
  });
  if (createErr) {
    // Some projects already have the user in Auth but outside simple page-1 lookups.
    // Retry by finding the user via paginated listing then promoting in place.
    if (createErr.message.toLowerCase().includes("already")) {
      const { users: retryUsers, error: retryListErr } = await listAllUsers();
      if (retryListErr) return new NextResponse(retryListErr, { status: 400 });
      const retryMatch = retryUsers.find((u) => String(u.email || "").toLowerCase() === email);
      if (retryMatch) {
        const { error: retryUpdateErr } = await admin.auth.admin.updateUserById(retryMatch.id, {
          app_metadata: { ...(retryMatch.app_metadata || {}), role: "hr", approved: true },
          ...(requestedPassword ? { password } : {}),
        });
        if (retryUpdateErr) return new NextResponse(retryUpdateErr.message, { status: 400 });
        return NextResponse.json({ ok: true, mode: "updated", email, generatedPassword: null });
      }
    }
    return new NextResponse(createErr.message, { status: 400 });
  }

  return NextResponse.json({ ok: true, mode: "created", email, generatedPassword: requestedPassword ? null : password });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) return new NextResponse("Missing user_id", { status: 400 });
  if (userId === guard.user.id) return new NextResponse("Cannot delete your own admin account", { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) return new NextResponse(userErr?.message || "User not found", { status: 404 });
  if (String(userData.user.app_metadata?.role || "") === "admin") {
    return new NextResponse("Cannot delete another admin from this panel", { status: 400 });
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return new NextResponse(delErr.message, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { user_id?: string; action?: "approve" | "revoke"; role?: "hr" | "admin" | "" };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const userId = String(body.user_id || "").trim();
  const action = body.action || "approve";
  const targetRole = body.role === "admin" ? "admin" : body.role === "hr" ? "hr" : "hr";
  if (!userId) return new NextResponse("Missing user_id", { status: 400 });
  if (userId === guard.user.id) return new NextResponse("Cannot change your own admin approval here", { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user) return new NextResponse(userErr?.message || "User not found", { status: 404 });

  const currentMeta = userData.user.app_metadata || {};
  const nextMeta =
    action === "approve"
      ? { ...currentMeta, role: targetRole, approved: true }
      : { ...currentMeta, approved: false };

  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMeta,
  });
  if (upErr) return new NextResponse(upErr.message, { status: 400 });
  return NextResponse.json({ ok: true, action, role: nextMeta.role || "" });
}

