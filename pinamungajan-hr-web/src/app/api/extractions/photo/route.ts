import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { downloadObjectAsBuffer, FALLBACK_PHOTO_BUCKET, PRIMARY_PHOTO_BUCKET, uploadPhotoWithBucketFallback } from "@/lib/supabase/storageFallback";

export const runtime = "nodejs";

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
  const employeeIdFromBody = body.employee_id === null || body.employee_id === undefined ? null : String(body.employee_id);
  const force = Boolean(body.force);

  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

  const debugPhoto = (extraction as any)?.raw_extracted_json?.debug?.photo || null;
  const storedPath = debugPhoto?.storedPath ? String(debugPhoto.storedPath) : "";
  const faceDetected = debugPhoto?.faceDetected === true;
  const storedBucket = debugPhoto?.bucketUsed ? String(debugPhoto.bucketUsed) : PRIMARY_PHOTO_BUCKET;

  if (!storedPath) {
    return new NextResponse("No extracted photo stored for this extraction. Run OCR again.", { status: 400 });
  }

  if (!faceDetected) {
    return new NextResponse("Extracted photo did not pass face check; refusing to save.", { status: 400 });
  }

  // Determine employee id.
  let employeeId: string | null = employeeIdFromBody;
  if (!employeeId) {
    const fromRaw = (extraction as any)?.raw_extracted_json?.owner_employee_id ? String((extraction as any).raw_extracted_json.owner_employee_id) : null;
    employeeId = fromRaw || null;
  }
  if (!employeeId && (extraction as any)?.document_id) {
    const { data: doc } = await supabase.from("employee_documents").select("employee_id").eq("id", (extraction as any).document_id).single();
    employeeId = (doc as any)?.employee_id ? String((doc as any).employee_id) : null;
  }

  if (!employeeId) {
    return new NextResponse("No linked employee for this extraction. Commit/link an employee first.", { status: 400 });
  }

  const { data: emp, error: empErr } = await supabase.from("employees").select("id, photo_url").eq("id", employeeId).single();
  if (empErr || !emp) {
    return new NextResponse(empErr?.message || "Employee not found", { status: 404 });
  }

  if ((emp as any).photo_url && !force) {
    return new NextResponse("Employee already has a photo. Pass force=true to replace.", { status: 400 });
  }

  const employeePathPrimary = `employees/${employeeId}/pds_photo_${extractionId}.jpg`;
  let employeeBucketUsed = PRIMARY_PHOTO_BUCKET;
  let employeePath = employeePathPrimary;

  if (storedBucket === PRIMARY_PHOTO_BUCKET) {
    // Best case: intra-bucket copy.
    const { error: copyErr } = await supabase.storage.from(PRIMARY_PHOTO_BUCKET).copy(storedPath, employeePathPrimary);
    if (copyErr) {
      // If bucket missing, fallback to upload.
      if (/bucket.*not.*found/i.test(String(copyErr.message || ""))) {
        const bytes = await downloadObjectAsBuffer({ supabase, bucket: PRIMARY_PHOTO_BUCKET, path: storedPath });
        const info = await uploadPhotoWithBucketFallback({
          supabase,
          path: `employee_photos/${employeePathPrimary}`,
          bytes,
          contentType: "image/jpeg",
          upsert: true,
        });
        employeeBucketUsed = info.bucketUsed;
        employeePath = info.bucketUsed === PRIMARY_PHOTO_BUCKET ? employeePathPrimary : `employee_photos/${employeePathPrimary}`;
      } else {
        return new NextResponse(`Failed to copy photo: ${copyErr.message}`, { status: 400 });
      }
    }
  } else {
    // Cross-bucket: download and re-upload.
    const bytes = await downloadObjectAsBuffer({ supabase, bucket: storedBucket, path: storedPath });
    const info = await uploadPhotoWithBucketFallback({
      supabase,
      path: `employee_photos/${employeePathPrimary}`,
      bytes,
      contentType: "image/jpeg",
      upsert: true,
    });
    employeeBucketUsed = info.bucketUsed;
    employeePath = info.bucketUsed === PRIMARY_PHOTO_BUCKET ? employeePathPrimary : `employee_photos/${employeePathPrimary}`;
  }

  const employeeUpdate: any = {
    photo_url: employeePath,
    photo_source: "pds_extract",
    photo_updated_at: new Date().toISOString(),
  };
  // Best-effort: store bucket if column exists.
  employeeUpdate.photo_bucket = employeeBucketUsed;

  let upErr: any = null;
  try {
    const { error } = await supabase.from("employees").update(employeeUpdate).eq("id", employeeId);
    upErr = error;
    if (upErr) {
      const msg = String(upErr.message || "");
      if (/column .*photo_bucket/i.test(msg)) {
        delete employeeUpdate.photo_bucket;
        const { error: err2 } = await supabase.from("employees").update(employeeUpdate).eq("id", employeeId);
        upErr = err2;
      }
    }
  } catch (e) {
    upErr = e;
  }

  if (upErr) {
    return new NextResponse(`Failed to update employee photo: ${upErr.message}`, { status: 400 });
  }

  // Update extraction debug to point at final employeePath/bucket.
  try {
    await supabase
      .from("extractions")
      .update({
        raw_extracted_json: {
          ...(extraction as any).raw_extracted_json,
          debug: {
            ...((extraction as any).raw_extracted_json?.debug || null),
            photo: {
              ...debugPhoto,
              storedPath: employeePath,
              bucketUsed: employeeBucketUsed,
            },
          },
        },
      } as any)
      .eq("id", extractionId);
  } catch {
    // ignore
  }

  try {
    revalidatePath("/masterlist");
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, employee_id: employeeId, photo_path: employeePath });
}
