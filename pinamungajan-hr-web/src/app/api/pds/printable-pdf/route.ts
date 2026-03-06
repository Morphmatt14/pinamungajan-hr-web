import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";
import { cookies } from "next/headers";
import { detectPdsTemplateVersionFromText } from "@/lib/pds/templateDetect";
import { normalizeScanToLegal } from "@/lib/pds/normalizeScanToLegal";

export const runtime = "nodejs";

async function importPdfjs() {
  const attempts = [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist/build/pdf.js",
  ];

  let lastErr: unknown = null;
  for (const spec of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod: any = await import(spec);
      const pdfjs: any = mod?.default ?? mod;
      if (pdfjs?.getDocument) return pdfjs;
      lastErr = new Error(`Imported ${spec} but getDocument() missing`);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Unable to import pdfjs-dist");
}

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
  const extractionId = String(url.searchParams.get("extraction_id") || "").trim();
  const enhance = url.searchParams.get("enhance") !== "0";

  if (!extractionId) {
    return new NextResponse("Missing extraction_id", { status: 400 });
  }

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, batch_id, document_set_id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction?.document_id) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

  // Load all pages for this extraction set (document_set_id preferred, fallback to batch_id).
  const documentSetId = (extraction as any)?.document_set_id ? String((extraction as any).document_set_id) : null;
  const batchId = (extraction as any)?.batch_id ? String((extraction as any).batch_id) : null;

  let docs: any[] = [];
  if (documentSetId) {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("id, storage_bucket, storage_path, mime_type, page_index")
      .eq("document_set_id", documentSetId)
      .order("page_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return new NextResponse(error.message, { status: 400 });
    docs = (data || []) as any[];
  } else if (batchId) {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("id, storage_bucket, storage_path, mime_type, page_index")
      .eq("batch_id", batchId)
      .order("page_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return new NextResponse(error.message, { status: 400 });
    docs = (data || []) as any[];
  } else {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("id, storage_bucket, storage_path, mime_type, page_index")
      .eq("id", extraction.document_id)
      .single();
    if (error || !data) return new NextResponse(error?.message || "Document not found", { status: 404 });
    docs = [data];
  }

  const rows = (docs || []).filter((d) => d && d.storage_bucket && d.storage_path);
  if (rows.length === 0) return new NextResponse("No documents found for printable export", { status: 404 });

  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return new NextResponse("sharp not installed", { status: 500 });
  }

  const cookieStore = await cookies();
  const normCookie = cookieStore.get("pds_normalize_legal")?.value;
  const normalizeEnabled = normCookie === null || normCookie === undefined ? true : normCookie === "1";

  const raw = (extraction as any)?.raw_extracted_json || {};
  const ocrText = String((raw as any)?.text || "");
  const detected = detectPdsTemplateVersionFromText(ocrText);
  const isPds = detected.version !== "unknown";
  const wantNormalize = normalizeEnabled && isPds;

  const outPdf = await PDFDocument.create();
  const legalW = 8.5 * 72;
  const legalH = 13 * 72;

  for (let i = 0; i < rows.length; i++) {
    const d = rows[i];
    const bucket = String(d.storage_bucket || "");
    const path = String(d.storage_path || "");
    const mime = String(d.mime_type || "");
    if (!bucket || !path) continue;

    const { data: downloaded, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !downloaded) {
      continue;
    }

    const originalBytes = Buffer.from(await downloaded.arrayBuffer());
    const isPdf = mime === "application/pdf";
    let pageCount = 1;
    if (isPdf) {
      const pdfjs = await importPdfjs();
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(originalBytes), disableWorker: true });
      const pdf = await loadingTask.promise;
      pageCount = Number(pdf?.numPages ?? 1) || 1;
    }

    for (let p = 0; p < pageCount; p++) {
      if (wantNormalize) {
        const cachePath = `normalized/pds-legal/${extractionId}/doc-${String(d.id || i + 1)}/page-${p + 1}-dpi300.png`;
        let pngBuf: Buffer | null = null;
        const { data: cached } = await supabase.storage.from(bucket).download(cachePath);
        if (cached) {
          pngBuf = Buffer.from(await cached.arrayBuffer());
        } else {
          const norm = await normalizeScanToLegal({
            bytes: originalBytes,
            mimeType: mime,
            pageIndex: p,
            dpi: 300,
            enhance,
          });
          pngBuf = Buffer.from(norm.buffer);
          await supabase.storage.from(bucket).upload(cachePath, pngBuf, {
            contentType: "image/png",
            upsert: true,
          });

          if (i === 0 && p === 0) {
            try {
              const updatedRaw = {
                ...raw,
                debug: {
                  ...(raw as any).debug,
                  normalize: norm.debug,
                },
              };
              await supabase.from("extractions").update({ raw_extracted_json: updatedRaw }).eq("id", extractionId);
            } catch {
              // ignore
            }
          }
        }

        const img = await outPdf.embedPng(pngBuf);
        const page = outPdf.addPage([legalW, legalH]);
        page.drawImage(img, { x: 0, y: 0, width: legalW, height: legalH });
      } else {
        const input = mime === "application/pdf" ? sharp(originalBytes, { density: 300, page: p }) : sharp(originalBytes);
        const pipeline = enhance ? input.rotate().normalise().sharpen({ sigma: 1 }) : input.rotate();
        const png = await pipeline.png().toBuffer();

        const img = await outPdf.embedPng(png);
        const page = outPdf.addPage([legalW, legalH]);
        const scale = Math.min(legalW / Math.max(1, img.width), legalH / Math.max(1, img.height));
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (legalW - w) / 2;
        const y = (legalH - h) / 2;
        page.drawImage(img, { x, y, width: w, height: h });
      }
      if (!isPdf) break;
    }
  }

  const out = await outPdf.save();
  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=printable-${extractionId}.pdf`,
      "cache-control": "no-store",
    },
  });
}
