import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeAgeAndGroupFromDobIso } from "@/lib/age";
import { revalidatePath } from "next/cache";

function normalizeNameForMatch(s: string) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePlaceholderName(s: string) {
  const u = String(s || "").toUpperCase().trim();
  if (!u) return true;
  if (["N/A", "NA", "NONE", "NULL", "UNKNOWN", "NOT AVAILABLE"].includes(u)) return true;
  if (/\b(YYYY|MM|DD)\b/.test(u)) return true;
  if (/\bMM\s*DD\s*YYYY\b/.test(u)) return true;
  return false;
}

function looksLikeSamePersonLoose(a: any, b: any) {
  // Keep this simple and conservative: same normalized name key.
  const aKey = normalizeNameForMatch(`${a.last_name || ""} ${a.first_name || ""} ${a.middle_name || ""}`);
  const bKey = normalizeNameForMatch(`${b.last_name || ""} ${b.first_name || ""} ${b.middle_name || ""}`);
  if (!aKey || !bKey || aKey !== bKey) return false;

  // If both have DOB, require exact match. (Avoid fuzzy date guessing.)
  const aDob = a.date_of_birth ? String(a.date_of_birth) : "";
  const bDob = b.date_of_birth ? String(b.date_of_birth) : "";
  if (aDob && bDob) return aDob === bDob;

  // If either DOB missing, treat as possible match (manual confirmation required).
  return true;
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

  const extractionId = String(body.extraction_id || "");
  const chosenEmployeeIdRaw = body.employee_id === null || body.employee_id === undefined ? null : String(body.employee_id);
  const forceCreateNew = Boolean(body.force_create_new);
  const confirm = body.confirm === null || body.confirm === undefined ? null : String(body.confirm);

  console.log("[DEBUG COMMIT] Request body:", body);

  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("*")
    .eq("id", extractionId)
    .single();

  console.log("[DEBUG COMMIT] Extraction query result:", {
    found: !!extraction,
    error: exErr?.message || null,
    hasRawJson: !!extraction?.raw_extracted_json,
    hasAppointmentData: !!extraction?.appointment_data,
    appointmentDataKeys: extraction?.appointment_data ? Object.keys(extraction.appointment_data) : [],
  });

  if (exErr || !extraction?.document_id) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("employee_documents")
    .select("id, employee_id")
    .eq("id", extraction.document_id)
    .single();

  console.log("[DEBUG COMMIT] Document query result:", {
    found: !!doc,
    error: docErr?.message || null,
    hasEmployeeId: !!doc?.employee_id,
  });

  if (docErr || !doc?.id) {
    return new NextResponse(docErr?.message || "Document not found", { status: 404 });
  }

  const owner = (extraction as any)?.raw_extracted_json?.owner_candidate || {};
  const appointmentDataFromColumn = (extraction as any)?.appointment_data;
  
  console.log("[DEBUG COMMIT] Owner candidate:", owner);
  console.log("[DEBUG COMMIT] Appointment data from column:", appointmentDataFromColumn);
  
  const ownerCandidate = {
    last_name: String(owner.last_name || "").trim(),
    first_name: String(owner.first_name || "").trim(),
    middle_name: String(owner.middle_name || "").trim() || null,
    name_extension: owner.name_extension ? String(owner.name_extension).trim() : null,
    date_of_birth: owner.date_of_birth ? String(owner.date_of_birth).trim() : null, // ISO expected
    gender: owner.gender ? String(owner.gender).trim() : null,
  };

  if (!ownerCandidate.last_name || !ownerCandidate.first_name) {
    return new NextResponse("Owner candidate is missing last_name/first_name. Fix Owner fields first.", { status: 400 });
  }

  if (looksLikePlaceholderName(ownerCandidate.last_name) || looksLikePlaceholderName(ownerCandidate.first_name)) {
    return new NextResponse("Owner candidate looks invalid (placeholder name). Re-run OCR with a clearer scan.", {
      status: 400,
    });
  }

  const alreadyLinked = doc.employee_id ? String(doc.employee_id) : null;
  const primaryEmployeeId = alreadyLinked || null;

  // Helper: Link ALL documents in the same document_set/batch to the employee
  const linkAllDocs = async (employeeId: string) => {
    const setId = (extraction as any)?.document_set_id;
    const batchId = (extraction as any)?.batch_id;

    if (!setId && !batchId) {
      // Just link the single document
      await supabase.from("employee_documents").update({ employee_id: employeeId }).eq("id", doc.id);
      return;
    }

    // Find all unlinked documents in the same set/batch
    let query = supabase.from("employee_documents").select("id").is("employee_id", null);
    if (setId) query = query.eq("document_set_id", setId);
    if (batchId) query = query.eq("batch_id", batchId);

    const { data: relatedDocs } = await query;
    const docIds = relatedDocs?.map((d: any) => d.id) || [];

    if (docIds.length > 0) {
      await supabase.from("employee_documents").update({ employee_id: employeeId }).in("id", docIds);
    }

    // Also update all related extractions
    try {
      let exQuery = supabase.from("extractions").select("id");
      if (setId) exQuery = exQuery.eq("document_set_id", setId);
      if (batchId) exQuery = exQuery.eq("batch_id", batchId);
      const { data: relatedEx } = await exQuery;
      if (relatedEx && relatedEx.length > 0) {
        await supabase.from("extractions").update({ linked_employee_id: employeeId } as any).in("id", relatedEx.map((e: any) => e.id));
      }
    } catch { /* ignore */ }
  };

  // Helper: Save appointment fields to employee record
  const saveAppointmentFields = async (employeeId: string) => {
    const rawJson = (extraction as any)?.raw_extracted_json;
    const appointmentData = rawJson?.appointment_data || (extraction as any)?.appointment_data;
    
    console.log("[DEBUG] saveAppointmentFields called for employee:", employeeId);
    console.log("[DEBUG] appointment_data found:", !!appointmentData);
    console.log("[DEBUG] appointment_data content:", JSON.stringify(appointmentData, null, 2));
    
    if (!appointmentData) {
      console.log("[DEBUG] No appointment data found - skipping");
      return;
    }

    const patch: any = {};
    
    // Appointment fields should overwrite existing values (appointment is authoritative)
    if (appointmentData.position_title) patch.position_title = appointmentData.position_title;
    if (appointmentData.office_department) patch.office_department = appointmentData.office_department;
    if (appointmentData.sg) patch.sg = appointmentData.sg;
    if (appointmentData.step) patch.step = appointmentData.step;
    if (appointmentData.monthly_salary) patch.monthly_salary = appointmentData.monthly_salary;
    if (appointmentData.annual_salary) patch.annual_salary = appointmentData.annual_salary;
    
    if (appointmentData.appointment_date) {
      patch.date_hired = appointmentData.appointment_date;
      const hireDate = new Date(appointmentData.appointment_date);
      const now = new Date();
      const diffMs = now.getTime() - hireDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      patch.tenure_years = Math.floor(diffDays / 365);
      patch.tenure_months = Math.floor((diffDays % 365) / 30);
    }

    console.log("[DEBUG] Patch to apply:", JSON.stringify(patch, null, 2));

    if (Object.keys(patch).length > 0) {
      // Appointment data updates the employee record directly
      const { error: updateError, data: updateData } = await supabase.from("employees").update(patch).eq("id", employeeId).select();
      if (updateError) {
        console.error("[DEBUG] Failed to update employee:", updateError);
        console.error("[DEBUG] Error code:", updateError.code);
        console.error("[DEBUG] Error message:", updateError.message);
      } else {
        console.log("[DEBUG] Employee updated successfully");
        console.log("[DEBUG] Update result:", updateData);
        
        // Verify the update by re-querying
        const { data: verifyData } = await supabase.from("employees").select("position_title, office_department, sg, step, monthly_salary").eq("id", employeeId).single();
        console.log("[DEBUG] Verified employee data after update:", verifyData);
      }
    }
  };

  // 1) If UI selected an employee explicitly, link to it.
  if (chosenEmployeeIdRaw) {
    const chosenEmployeeId = chosenEmployeeIdRaw;

    await linkAllDocs(chosenEmployeeId);
    await saveAppointmentFields(chosenEmployeeId);

    // Mark committed.
    await supabase
      .from("extractions")
      .update({
        status: "committed",
        raw_extracted_json: {
          ...(extraction as any).raw_extracted_json,
          owner_employee_id: chosenEmployeeId,
        },
        updated_by: user.id,
      })
      .eq("id", extractionId);

    try {
      revalidatePath("/masterlist");
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, employee_id: chosenEmployeeId, action: "linked" });
  }

  // 2) If already linked (doc.employee_id), treat that as the primary key.
  if (primaryEmployeeId) {
    // Update appointment fields first
    await saveAppointmentFields(primaryEmployeeId);
    
    // Consider updating missing demographics, but don't overwrite.
    const dobIso = ownerCandidate.date_of_birth || null;
    const computedAge = dobIso ? computeAgeAndGroupFromDobIso(dobIso) : { age: null, age_group: null };

    const patch: any = {};
    if (dobIso) patch.date_of_birth = dobIso;
    if (ownerCandidate.gender) patch.gender = ownerCandidate.gender;
    if (computedAge.age !== null) {
      patch.age = computedAge.age;
      patch.age_group = computedAge.age_group;
    }

    // Best-effort: update only null-ish fields.
    const { data: existing } = await supabase
      .from("employees")
      .select("id, date_of_birth, gender, age, age_group")
      .eq("id", primaryEmployeeId)
      .single();

    if (existing) {
      const safePatch: any = {};
      if (patch.date_of_birth && !existing.date_of_birth) safePatch.date_of_birth = patch.date_of_birth;
      if (patch.gender && !existing.gender) safePatch.gender = patch.gender;
      if (patch.age !== null && (existing.age === null || existing.age === undefined || Number(existing.age) === 0)) {
        safePatch.age = patch.age;
        safePatch.age_group = patch.age_group;
      }
      if (Object.keys(safePatch).length > 0) {
        await supabase.from("employees").update(safePatch).eq("id", primaryEmployeeId);
      }
    }

    await supabase
      .from("extractions")
      .update({
        status: "committed",
        raw_extracted_json: {
          ...(extraction as any).raw_extracted_json,
          owner_employee_id: primaryEmployeeId,
        },
        updated_by: user.id,
      })
      .eq("id", extractionId);

    try {
      revalidatePath("/masterlist");
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, employee_id: primaryEmployeeId, action: "already_linked" });
  }

  // 3) No link yet: find candidates.
  const last = ownerCandidate.last_name;
  const first = ownerCandidate.first_name;

  const { data: candidates, error: candErr } = await supabase
    .from("employees")
    .select("id, last_name, first_name, middle_name, date_of_birth")
    .ilike("last_name", last)
    .ilike("first_name", first)
    .limit(25);

  if (candErr) return new NextResponse(candErr.message, { status: 400 });

  const normKey = normalizeNameForMatch(`${last} ${first} ${ownerCandidate.middle_name || ""}`);

  const possible = (candidates || []).filter((c: any) => {
    const cKey = normalizeNameForMatch(`${c.last_name || ""} ${c.first_name || ""} ${c.middle_name || ""}`);
    if (cKey !== normKey) return false;
    return looksLikeSamePersonLoose(ownerCandidate, c);
  });

  const dobIso = ownerCandidate.date_of_birth || null;

  // Auto-link if we have DOB and exactly one candidate matches name+DOB.
  if (dobIso) {
    const exact = possible.filter((c: any) => String(c.date_of_birth || "") === dobIso);
    if (exact.length === 1 && !forceCreateNew && confirm !== "no") {
      const targetId = String(exact[0].id);
      await linkAllDocs(targetId);
      await saveAppointmentFields(targetId);

      await supabase
        .from("extractions")
        .update({
          status: "committed",
          raw_extracted_json: {
            ...(extraction as any).raw_extracted_json,
            owner_employee_id: targetId,
          },
          updated_by: user.id,
        })
        .eq("id", extractionId);

      try {
        revalidatePath("/masterlist");
      } catch {
        // ignore
      }

      return NextResponse.json({ ok: true, employee_id: targetId, action: "auto_linked" });
    }
  }

  // If there are possible matches (or DOB missing), require confirmation unless forceCreateNew.
  if (!forceCreateNew && possible.length > 0) {
    return NextResponse.json({
      ok: false,
      needs_confirmation: true,
      reason: dobIso ? "possible_duplicate" : "dob_missing",
      owner: ownerCandidate,
      candidates: possible.slice(0, 5).map((c: any) => ({
        id: String(c.id),
        last_name: c.last_name,
        first_name: c.first_name,
        middle_name: c.middle_name,
        date_of_birth: c.date_of_birth,
      })),
    });
  }

  // Create new employee WITH appointment data if available
  const rawJson = (extraction as any)?.raw_extracted_json;
  const appointmentData = rawJson?.appointment_data || (extraction as any)?.appointment_data;
  
  const computedAge = dobIso ? computeAgeAndGroupFromDobIso(dobIso) : { age: null, age_group: null };

  const { data: created, error: createErr } = await supabase
    .from("employees")
    .insert({
      last_name: ownerCandidate.last_name,
      first_name: ownerCandidate.first_name,
      middle_name: ownerCandidate.middle_name,
      name_extension: ownerCandidate.name_extension,
      date_of_birth: dobIso,
      gender: ownerCandidate.gender,
      age: computedAge.age,
      age_group: computedAge.age_group,
      created_by: user.id,
      // Appointment data (if available from extraction)
      position_title: appointmentData?.position_title || null,
      office_department: appointmentData?.office_department || null,
      sg: appointmentData?.sg || null,
      step: appointmentData?.step || null,
      monthly_salary: appointmentData?.monthly_salary || null,
      annual_salary: appointmentData?.annual_salary || null,
      date_hired: appointmentData?.appointment_date || null,
      // Required NOT NULL columns in this schema
      tenure_years: appointmentData?.appointment_date ? Math.floor((new Date().getTime() - new Date(appointmentData.appointment_date).getTime()) / (1000 * 60 * 60 * 24 * 365)) : 0,
      tenure_months: 0,
    })
    .select("id")
    .single();

  if (createErr || !created?.id) {
    return new NextResponse(createErr?.message || "Failed to create employee", { status: 400 });
  }

  const newId = String(created.id);

  await linkAllDocs(newId);
  await saveAppointmentFields(newId);

  await supabase
    .from("extractions")
    .update({
      status: "committed",
      raw_extracted_json: {
        ...(extraction as any).raw_extracted_json,
        owner_employee_id: newId,
      },
      updated_by: user.id,
    })
    .eq("id", extractionId);

  try {
    revalidatePath("/masterlist");
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, employee_id: newId, action: "created" });
}
