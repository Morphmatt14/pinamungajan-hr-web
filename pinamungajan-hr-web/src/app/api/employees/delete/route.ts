import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatSbError(err: any) {
  if (!err) return "(no details)";
  const msg = String(err.message || err.error_description || err.details || "").trim();
  const code = String(err.code || "").trim();
  const details = String(err.details || "").trim();
  const hint = String(err.hint || "").trim();
  return [
    msg ? `message=${msg}` : null,
    code ? `code=${code}` : null,
    details ? `details=${details}` : null,
    hint ? `hint=${hint}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }

  const employeeId = String(body.employee_id || "");
  if (!employeeId) {
    return new NextResponse("Missing employee_id", { status: 400 });
  }

  // IMPORTANT:
  // - This route intentionally uses the session-bound client (anon key) so it obeys RLS.
  // - For deletion to work reliably, you MUST:
  //   1) set employee_documents.employee_id FK to ON DELETE CASCADE
  //   2) allow DELETE on employee_documents for authenticated/HR users (so cascades don't get blocked by RLS)
  const { error: empDelErr } = await supabase.from("employees").delete().eq("id", employeeId);
  if (empDelErr) {
    const details = formatSbError(empDelErr);
    const msg = String((empDelErr as any)?.message || "");
    const isFk = String((empDelErr as any)?.code || "") === "23503" || /foreign key/i.test(msg);
    const hint = isFk
      ? "Likely missing ON DELETE CASCADE on employee_documents.employee_id or RLS blocks cascade deletes. Run supabase-fk-cascade-employees.sql and apply the RLS delete policies."
      : null;

    return new NextResponse(
      `Failed to delete employee: ${details}${hint ? `\nHint: ${hint}` : ""}`,
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, employee_id: employeeId });
}
