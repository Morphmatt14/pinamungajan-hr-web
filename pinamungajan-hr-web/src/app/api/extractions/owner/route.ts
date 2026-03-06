import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeAgeAndGroupFromDobIso } from "@/lib/age";
import { safeParseDateToIso } from "@/lib/pds/validators";
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
  const lastName = String(body.last_name || "").trim();
  const firstName = String(body.first_name || "").trim();
  const middleNameRaw = body.middle_name === null || body.middle_name === undefined ? "" : String(body.middle_name);
  const middleName = middleNameRaw.trim();
  const dobRaw = String(body.date_of_birth || "").trim();

  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });
  if (!lastName || !firstName) return new NextResponse("Missing last_name or first_name", { status: 400 });

  let dob: string | null = null;
  if (dobRaw) {
    const parsed = safeParseDateToIso(dobRaw, {
      isPds: true,
      pdsLabelSuggestsDdMm: true,
    });
    if (!parsed.iso) {
      return new NextResponse(
        `Invalid date_of_birth. Reasons: ${parsed.reasonsIfNull.join(", ")}`,
        { status: 400 }
      );
    }
    dob = parsed.iso;
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

  const computed = dob ? computeAgeAndGroupFromDobIso(dob) : { age: null, age_group: null };

  const { error: empErr } = await supabase
    .from("employees")
    .update({
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName || null,
      date_of_birth: dob,
      age: computed.age ?? 0,
      age_group: computed.age_group,
    })
    .eq("id", employeeId);

  if (empErr) {
    return new NextResponse(empErr.message, { status: 400 });
  }

  const raw = (extraction as any).raw_extracted_json || {};
  const ownerCandidate = (raw as any).owner_candidate || {};

  const updatedRaw = {
    ...raw,
    owner_candidate: {
      ...ownerCandidate,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName || null,
      date_of_birth: dob,
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

  return NextResponse.json({
    ok: true,
    extraction_id: extractionId,
    employee_id: employeeId,
    owner: { last_name: lastName, first_name: firstName, middle_name: middleName || null, date_of_birth: dob },
  });
}
