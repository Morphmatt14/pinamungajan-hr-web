import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { READ_ONLY_MODE } from "@/lib/readOnlyMode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Confirmation is allowed in read-only mode (it updates structured data, not the PDF).
  if (READ_ONLY_MODE) {
    // still allow
  }

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

  const extractionId = String(body.extraction_id || "");
  const valueRaw = String(body.value || "").trim();
  const value = valueRaw.toLowerCase() === "male" ? "Male" : valueRaw.toLowerCase() === "female" ? "Female" : "";

  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });
  if (!value) return new NextResponse("Invalid value. Expected Male or Female", { status: 400 });

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction?.document_id) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("employee_documents")
    .select("id, employee_id")
    .eq("id", extraction.document_id)
    .single();

  if (docErr || !doc?.id) {
    return new NextResponse(docErr?.message || "Document not found", { status: 404 });
  }

  const employeeId = doc.employee_id ? String(doc.employee_id) : null;
  if (!employeeId) {
    return new NextResponse("No linked employee yet. Link owner first.", { status: 400 });
  }

  const raw = (extraction as any).raw_extracted_json || {};
  const ownerCandidate = (raw as any).owner_candidate || {};

  const updatedRaw = {
    ...raw,
    owner_candidate: {
      ...ownerCandidate,
      gender: value,
    },
    debug: {
      ...(raw as any).debug,
      sex: {
        ...((raw as any).debug?.sex || {}),
        decision: value,
        confirmed: true,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      },
    },
  };

  const { error: empErr } = await supabase.from("employees").update({ gender: value }).eq("id", employeeId);
  if (empErr) {
    return new NextResponse(empErr.message, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("extractions")
    .update({ raw_extracted_json: updatedRaw, updated_by: user.id })
    .eq("id", extractionId);

  if (upErr) {
    return new NextResponse(upErr.message, { status: 400 });
  }

  return NextResponse.json({ ok: true, extraction_id: extractionId, employee_id: employeeId, value });
}
