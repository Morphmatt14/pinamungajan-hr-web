import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function ensurePrivateBucket(admin: any, bucketName: string) {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw new Error(listErr.message);
  const exists = (buckets || []).some((b: any) => String(b?.name || "") === bucketName);
  if (exists) return;

  const { error: createErr } = await admin.storage.createBucket(bucketName, {
    public: false,
  } as any);
  if (createErr) {
    // Race-safe: if another request created it, ignore.
    const msg = String(createErr.message || "");
    if (!/already exists/i.test(msg)) throw new Error(createErr.message);
  }
}

async function downloadObject(admin: any, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || "download_failed");
  const ab = await (data as any).arrayBuffer();
  return Buffer.from(ab);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return new NextResponse("Unauthorized", { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }

  const extractionId = String(body.extraction_id || "");
  const employeeId = String(body.employee_id || "");
  const force = Boolean(body.force);

  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });
  if (!employeeId) return new NextResponse("Missing employee_id", { status: 400 });

  let dbClient: any = supabase;
  let storageClient: any = supabase;
  try {
    const admin = createSupabaseAdminClient();
    dbClient = admin;
    storageClient = admin;
  } catch {
    // fall back to user session; requires RLS/storage policies
  }

  try {
    const { data: emp, error: empErr } = await dbClient
      .from("employees")
      .select("id, photo_url")
      .eq("id", employeeId)
      .single();
    if (empErr || !emp) return new NextResponse(empErr?.message || "Employee not found", { status: 404 });
    if ((emp as any).photo_url && !force) {
      return new NextResponse("Employee already has a photo. Pass force=true to replace.", { status: 400 });
    }

    const { data: extraction, error: exErr } = await dbClient
      .from("extractions")
      .select("id, document_id, raw_extracted_json")
      .eq("id", extractionId)
      .single();
    if (exErr || !extraction) return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });

    const debugPhoto = (extraction as any)?.raw_extracted_json?.debug?.photo || null;
    const storedPath = debugPhoto?.storedPath ? String(debugPhoto.storedPath) : "";
    const storedBucket = debugPhoto?.bucketUsed ? String(debugPhoto.bucketUsed) : "employee_photos";
    const faceDetected = debugPhoto?.faceDetected === true;

    if (!storedPath) return new NextResponse("No extracted photo stored for this extraction. Run OCR again.", { status: 400 });
    if (!faceDetected) return new NextResponse("Extracted photo did not pass face check; refusing to save.", { status: 400 });

    const destBucket = "employee_photos";
    try {
      await ensurePrivateBucket(storageClient, destBucket);
    } catch {
      // ignore (user-session client may not be allowed to list/create buckets)
    }

    const bytes = await downloadObject(storageClient, storedBucket, storedPath);
    const destPath = `${employeeId}/id_photo_${extractionId}.jpg`;

    const { error: upErr } = await storageClient.storage.from(destBucket).upload(destPath, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    } as any);

    if (upErr) return new NextResponse(upErr.message, { status: 400 });

    const employeeUpdate: any = {
      photo_url: destPath,
      photo_bucket: destBucket,
      photo_source: "pds_extract",
      photo_updated_at: new Date().toISOString(),
    };

    const { error: empUpErr } = await dbClient.from("employees").update(employeeUpdate).eq("id", employeeId);
    if (empUpErr) return new NextResponse(empUpErr.message, { status: 400 });

  // Best-effort: sync extraction debug to reflect final stored location.
    try {
      await dbClient
        .from("extractions")
        .update({
          raw_extracted_json: {
            ...(extraction as any).raw_extracted_json,
            debug: {
              ...((extraction as any).raw_extracted_json?.debug || null),
              photo: {
                ...debugPhoto,
                storedPath: destPath,
                bucketUsed: destBucket,
              },
            },
          },
        } as any)
        .eq("id", extractionId);
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, employee_id: employeeId, extraction_id: extractionId, bucket: destBucket, path: destPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(msg || "Failed to save photo", { status: 500 });
  }
}
