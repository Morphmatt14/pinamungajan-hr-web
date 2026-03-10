import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";

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
  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction?.document_id) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

  // Prefer already generated searchable_pdf (looks exactly like scan for PDFs and images)
  const searchable = (extraction as any).raw_extracted_json?.searchable_pdf;
  if (searchable?.storage_bucket && searchable?.storage_path) {
    const { data: downloaded, error: dlErr } = await supabase.storage
      .from(String(searchable.storage_bucket))
      .download(String(searchable.storage_path));

    if (!dlErr && downloaded) {
      const buf = Buffer.from(await downloaded.arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename=scan-${extractionId}.pdf`,
        },
      });
    }
  }

  // Fallback: download original and rasterize page 1 to a PDF.
  const { data: doc, error: docErr } = await supabase
    .from("employee_documents")
    .select("storage_bucket, storage_path, mime_type")
    .eq("id", extraction.document_id)
    .single();

  if (docErr || !doc?.storage_bucket || !doc?.storage_path) {
    return new NextResponse(docErr?.message || "Document not found", { status: 404 });
  }

  const { data: downloaded, error: dlErr } = await supabase.storage
    .from(String(doc.storage_bucket))
    .download(String(doc.storage_path));

  if (dlErr || !downloaded) {
    return new NextResponse(dlErr?.message || "Failed to download original", { status: 400 });
  }

  const originalBytes = Buffer.from(await downloaded.arrayBuffer());
  const mime = String(doc.mime_type || "");

  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return new NextResponse("sharp not installed", { status: 500 });
  }

  const png =
    mime === "application/pdf"
      ? await sharp(originalBytes, { density: 220 }).png().toBuffer()
      : await sharp(originalBytes).png().toBuffer();

  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedPng(png);
  const page = pdfDoc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

  const out = await pdfDoc.save();
  const buf = Buffer.from(out);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=scan-${extractionId}.pdf`,
    },
  });
}
