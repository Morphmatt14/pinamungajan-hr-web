import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";
import { preprocessPdsPage } from "@/lib/pds/preprocessPdsPage";

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
  if (!batchId) return new NextResponse("Missing batch_id", { status: 400 });

  const { data: docs, error: docsErr } = await supabase
    .from("employee_documents")
    .select("id, storage_bucket, storage_path, mime_type, page_index")
    .eq("batch_id", batchId)
    .order("page_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (docsErr) return new NextResponse(docsErr.message, { status: 400 });
  const rows = (docs || []) as any[];
  if (rows.length === 0) return new NextResponse("No documents found for batch", { status: 404 });

  const outPdf = await PDFDocument.create();
  const legalW = 8.5 * 72;
  const legalH = 13 * 72;

  for (let i = 0; i < rows.length; i++) {
    const d = rows[i];
    const bucket = String(d.storage_bucket || "");
    const path = String(d.storage_path || "");
    if (!bucket || !path) continue;

    const { data: downloaded, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !downloaded) continue;

    const bytes = Buffer.from(await downloaded.arrayBuffer());
    const mime = String(d.mime_type || "application/octet-stream");

    // Cache processed image in storage for consistent exports/OCR.
    const cachePath = `normalized/pds-legal/batch-${batchId}/page-${i + 1}-dpi300.png`;
    let pngBuf: Buffer | null = null;

    const { data: cached } = await supabase.storage.from(bucket).download(cachePath);
    if (cached) {
      pngBuf = Buffer.from(await cached.arrayBuffer());
    } else {
      const processed = await preprocessPdsPage({ bytes, mimeType: mime, pageIndex: 0, dpi: 300 });
      pngBuf = processed.buffer;
      await supabase.storage.from(bucket).upload(cachePath, pngBuf, { contentType: "image/png", upsert: true });
    }

    const img = await outPdf.embedPng(pngBuf);
    const page = outPdf.addPage([legalW, legalH]);
    page.drawImage(img, { x: 0, y: 0, width: legalW, height: legalH });
  }

  const out = await outPdf.save();
  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=batch-${batchId}-printable.pdf`,
      "cache-control": "no-store",
    },
  });
}
