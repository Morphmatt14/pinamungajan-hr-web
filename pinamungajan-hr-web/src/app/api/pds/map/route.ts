import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAdminOrHr(user: any) {
  const role = String(user?.app_metadata?.role || "").toLowerCase();
  return role === "admin" || role === "hr";
}

function isMissingTableError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("does not exist") || msg.includes("relation") && msg.includes("pds_template_maps");
}

function isPermissionError(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  return code === "42501" || msg.includes("permission denied") || msg.includes("row level security");
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const url = new URL(request.url);
  const template = String(url.searchParams.get("template") || "").trim();
  const page = Number(url.searchParams.get("page") || "");

  if (!template || !Number.isFinite(page)) {
    return new NextResponse("Missing template or page", { status: 400 });
  }

  const { data, error } = await supabase
    .from("pds_template_maps")
    .select("id, template_version, page, map_json, updated_at")
    .eq("template_version", template)
    .eq("page", page)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    // If the table hasn't been created yet, allow the UI to fallback to /api/pds/calibrate.
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: true, template, page, map_json: null, updated_at: null, warning: "pds_template_maps_missing" });
    }
    // If RLS blocks reads, allow fallback to /api/pds/calibrate.
    if (isPermissionError(error)) {
      return NextResponse.json({
        ok: true,
        template,
        page,
        map_json: null,
        updated_at: null,
        warning: "pds_template_maps_unreadable",
      });
    }
    return new NextResponse(error.message, { status: 400 });
  }

  const row = (data || [])[0] as any;
  return NextResponse.json({
    ok: true,
    template,
    page,
    map_json: row?.map_json ?? null,
    updated_at: row?.updated_at ?? null,
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isAdminOrHr(user)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }

  const template = String(body.template_version || body.template || "").trim();
  const page = Number(body.page);
  const mapJson = body.map_json ?? null;

  if (!template || !Number.isFinite(page) || !mapJson) {
    return new NextResponse("Missing template_version, page, or map_json", { status: 400 });
  }

  const { data, error } = await supabase
    .from("pds_template_maps")
    .insert({
      template_version: template,
      page,
      map_json: mapJson,
      updated_by: user.id,
    })
    .select("id, template_version, page, map_json, updated_at")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return new NextResponse(
        [
          "Missing table: pds_template_maps.",
          "Run this SQL in Supabase SQL Editor:",
          "create table if not exists public.pds_template_maps (\n  id bigserial primary key,\n  template_version text not null,\n  page int not null,\n  map_json jsonb not null,\n  updated_by uuid null references auth.users(id),\n  updated_at timestamptz not null default now()\n);",
          "create index if not exists pds_template_maps_lookup on public.pds_template_maps (template_version, page, updated_at desc);",
        ].join("\n\n"),
        { status: 400 }
      );
    }
    if (isPermissionError(error)) {
      return new NextResponse(
        [
          "Forbidden by database policy (RLS) when inserting into pds_template_maps.",
          "Fix options:",
          "1) Disable RLS on pds_template_maps (quick dev option)",
          "   alter table public.pds_template_maps disable row level security;",
          "2) Or add policies (recommended):",
          "   alter table public.pds_template_maps enable row level security;",
          "   create policy pds_template_maps_read_auth on public.pds_template_maps for select to authenticated using (true);",
          "   create policy pds_template_maps_insert_admin_hr on public.pds_template_maps for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','hr'));",
          "Also ensure your user has app_metadata.role = admin/hr.",
        ].join("\n"),
        { status: 403 }
      );
    }
    return new NextResponse(error.message, { status: 400 });
  }

  return NextResponse.json({ ok: true, row: data });
}
