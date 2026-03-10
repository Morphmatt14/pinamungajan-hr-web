import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { READ_ONLY_MODE } from "@/lib/readOnlyMode";

export async function POST(request: Request) {
  if (READ_ONLY_MODE) {
    return new NextResponse("Not found", { status: 404 });
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
  const genderRaw = String(body.gender || "").trim();

  if (!extractionId) {
    return new NextResponse("Missing extraction_id", { status: 400 });
  }

  const gender = genderRaw.toLowerCase() === "male" ? "Male" : genderRaw.toLowerCase() === "female" ? "Female" : "";
  if (!gender) {
    return new NextResponse("Invalid gender. Expected 'Male' or 'Female'", { status: 400 });
  }

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

  if (docErr || !doc) {
    return new NextResponse(docErr?.message || "Document not found", { status: 404 });
  }

  const employeeId = (doc as any).employee_id as string | null;
  if (!employeeId) {
    return new NextResponse("No linked employee for this extraction yet. Run OCR first to link.", { status: 400 });
  }

  const { error: empErr } = await supabase.from("employees").update({ gender }).eq("id", employeeId);
  if (empErr) {
    return new NextResponse(empErr.message, { status: 400 });
  }

  const raw = (extraction as any).raw_extracted_json || {};
  const ownerCandidate = (raw as any).owner_candidate || {};

  const updatedRaw = {
    ...raw,
    owner_candidate: {
      ...ownerCandidate,
      gender,
    },
  };

  const { error: upErr } = await supabase
    .from("extractions")
    .update({
      raw_extracted_json: updatedRaw,
      updated_by: user.id,
    })
    .eq("id", extractionId);

  if (upErr) {
    return new NextResponse(upErr.message, { status: 400 });
  }

  return NextResponse.json({ ok: true, extraction_id: extractionId, employee_id: employeeId, gender });
}
