import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateDdMmYyyy } from "@/lib/pds/validators";
import { computeAgeAndGroupFromDobIso } from "@/lib/age";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const employeeId = String(id || "");
  if (!employeeId) return new NextResponse("Missing employee id", { status: 400 });

  const { data: employee, error: employeeErr } = await supabase
    .from("employees")
    .select(
      "id, last_name, first_name, middle_name, name_extension, date_of_birth, age, age_group, position_title, office_department, sg, monthly_salary, annual_salary, gender, photo_url, photo_bucket, photo_source, photo_updated_at, date_hired"
    )
    .eq("id", employeeId)
    .single();

  if (employeeErr || !employee) {
    return new NextResponse(employeeErr?.message || "Employee not found", { status: 404 });
  }

  // Preferred: employees.photo_url in employee_photos bucket.
  let photo: any = null;
  const employeePhotoPath = (employee as any)?.photo_url ? String((employee as any).photo_url) : "";
  if ((employee as any).photo_url) {
    try {
      const bucket = String((employee as any).photo_bucket || "employee_photos");
      const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl((employee as any).photo_url, 60 * 10);
      if (!signErr && signed?.signedUrl) {
        photo = {
          bucket,
          path: employeePhotoPath,
          signed_url: signed.signedUrl,
          source: (employee as any)?.photo_source ?? null,
          updated_at: (employee as any)?.photo_updated_at ?? null,
        };
      }
    } catch {
      // ignore
    }
  } else {
    // Fallback: latest linked image-like doc as "photo".
    const { data: doc } = await supabase
      .from("employee_documents")
      .select("id, storage_bucket, storage_path, mime_type, original_filename, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(10);

    const photoDoc = (doc || []).find((d: any) => String(d.mime_type || "").toLowerCase().startsWith("image/")) || null;

    let photoUrl: string | null = null;
    if (photoDoc?.storage_bucket && photoDoc?.storage_path) {
      const { data: signed } = await supabase.storage
        .from(String(photoDoc.storage_bucket))
        .createSignedUrl(String(photoDoc.storage_path), 60 * 10);
      photoUrl = signed?.signedUrl ?? null;
    }

    photo = photoDoc
      ? {
          document_id: photoDoc.id,
          original_filename: photoDoc.original_filename,
          mime_type: photoDoc.mime_type,
          created_at: photoDoc.created_at,
          signed_url: photoUrl,
        }
      : null;
  }

  const dobIso = (employee as any).date_of_birth ? String((employee as any).date_of_birth) : null;
  const computedAge = dobIso ? computeAgeAndGroupFromDobIso(dobIso) : { age: null, age_group: null };

  const { data: docs } = await supabase
    .from("employee_documents")
    .select("id, storage_bucket, storage_path, mime_type, original_filename, page_index, created_at, document_set_id, document_category, document_type, doc_type, detection_confidence, detection_evidence, extraction:extractions!left(id, status, document_type, appointment_data, created_at)")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);

  const documents = await Promise.all(
    (docs || []).map(async (d: any) => {
      const bucket = String(d.storage_bucket || "");
      const path = String(d.storage_path || "");
      let signed_url: string | null = null;
      if (bucket && path) {
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
        signed_url = signed?.signedUrl ?? null;
      }
      return {
        id: d.id,
        original_filename: d.original_filename,
        mime_type: d.mime_type,
        page_index: d.page_index,
        document_set_id: d.document_set_id,
        document_category: d.document_category,
        document_type: d.document_type,
        doc_type: d.doc_type,
        detection_confidence: d.detection_confidence,
        detection_evidence: d.detection_evidence,
        created_at: d.created_at,
        bucket,
        path,
        signed_url,
        extraction: d.extraction ? {
          id: d.extraction.id,
          status: d.extraction.status,
          document_type: d.extraction.document_type,
          appointment_data: d.extraction.appointment_data,
          created_at: d.extraction.created_at,
        } : null,
      };
    })
  );

  return NextResponse.json({
    employee: {
      ...employee,
      date_of_birth_display: dobIso ? formatDateDdMmYyyy(dobIso) : "",
      age_final: (employee as any).age ?? computedAge.age,
      age_group_final: (employee as any).age_group ?? computedAge.age_group,
    },
    photo,
    documents,
  });
}
