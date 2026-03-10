import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const extractionId = String(url.searchParams.get("extraction_id") || "").trim();
  const mode = String(url.searchParams.get("mode") || "jpeg").trim();

  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction) return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });

  const debugPhoto = (extraction as any)?.raw_extracted_json?.debug?.photo || null;
  const storedPath = debugPhoto?.storedPath ? String(debugPhoto.storedPath) : "";
  const storedBucket = debugPhoto?.bucketUsed ? String(debugPhoto.bucketUsed) : "employee_photos";

  if (mode === "json") {
    return NextResponse.json({ ok: true, extraction_id: extractionId, debug_photo: debugPhoto });
  }

  if (!storedPath) return new NextResponse("No extracted photo stored", { status: 404 });

  const { data: downloaded, error: dlErr } = await supabase.storage.from(storedBucket).download(storedPath);
  if (dlErr || !downloaded) return new NextResponse(dlErr?.message || "Failed to download", { status: 400 });

  const bytes = Buffer.from(await downloaded.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": `attachment; filename=extracted-photo-${extractionId}.jpg`,
      "cache-control": "no-store",
    },
  });
}
