import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { preprocessPdsPage } from "@/lib/pds/preprocessPdsPage";
import { buildStoreZip } from "@/lib/zip/storeZip";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const batchId = String(url.searchParams.get("batch_id") || "").trim();
  const documentSetId = String(url.searchParams.get("document_set_id") || "").trim();
  if (!batchId && !documentSetId) return new NextResponse("Missing batch_id or document_set_id", { status: 400 });

  const { data: docs, error: docsErr } = await supabase
    .from("employee_documents")
    .select("id, storage_bucket, storage_path, mime_type, original_filename, page_index")
    .eq(documentSetId ? "document_set_id" : "batch_id", documentSetId || batchId)
    .order("page_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (docsErr) return new NextResponse(docsErr.message, { status: 400 });
  const rows = (docs || []) as any[];
  if (rows.length === 0) return new NextResponse("No documents found", { status: 404 });

  const entries: Array<{ filename: string; data: Buffer }> = [];

  for (let i = 0; i < rows.length; i++) {
    const d = rows[i];
    const bucket = String(d.storage_bucket || "");
    const path = String(d.storage_path || "");
    if (!bucket || !path) continue;

    const { data: downloaded, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !downloaded) continue;

    const bytes = Buffer.from(await downloaded.arrayBuffer());
    const mime = String(d.mime_type || "application/octet-stream");

    const cacheKey = documentSetId ? `docset-${documentSetId}` : `batch-${batchId}`;
    const cachePath = `normalized/pds-legal/${cacheKey}/page-${i + 1}-dpi300.png`;
    let pngBuf: Buffer | null = null;

    const { data: cached } = await supabase.storage.from(bucket).download(cachePath);
    if (cached) {
      pngBuf = Buffer.from(await cached.arrayBuffer());
    } else {
      const processed = await preprocessPdsPage({ bytes, mimeType: mime, pageIndex: 0, dpi: 300 });
      pngBuf = processed.buffer;
      await supabase.storage.from(bucket).upload(cachePath, pngBuf, { contentType: "image/png", upsert: true });
    }

    const baseName = `page-${String(i + 1).padStart(2, "0")}.png`;
    entries.push({ filename: baseName, data: pngBuf });
  }

  const zipBuf = buildStoreZip(entries);
  return new NextResponse(zipBuf, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename=${documentSetId ? `document-set-${documentSetId}` : `batch-${batchId}`}-normalized-images.zip`,
      "cache-control": "no-store",
    },
  });
}
