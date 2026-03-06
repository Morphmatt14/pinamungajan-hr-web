import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

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
  const employeeId = String(url.searchParams.get("employee_id") || "").trim();
  const docType = String(url.searchParams.get("doc_type") || "").trim() as any;
  const format = String(url.searchParams.get("format") || "pdf").trim(); // pdf, zip, or original

  if (!employeeId) {
    return new NextResponse("Missing employee_id", { status: 400 });
  }

  // Build query
  let query = supabase
    .from("employee_documents")
    .select("id, storage_bucket, storage_path, mime_type, original_filename, page_index, doc_type, document_set_id, created_at")
    .eq("employee_id", employeeId);

  // Filter by doc_type if specified (not "all")
  if (docType && docType !== "all") {
    query = query.eq("doc_type", docType);
  }

  const { data: docs, error: docsErr } = await query
    .order("created_at", { ascending: false })
    .limit(100);

  if (docsErr) {
    return new NextResponse(docsErr.message, { status: 400 });
  }

  const rows = (docs || []) as any[];
  if (rows.length === 0) {
    return new NextResponse("No documents found", { status: 404 });
  }

  // Download all files
  const fileBuffers: Array<{ 
    name: string; 
    buffer: Buffer; 
    mimeType: string;
    docType: string;
    originalFilename: string;
  }> = [];

  for (const d of rows) {
    const bucket = String(d.storage_bucket || "");
    const path = String(d.storage_path || "");
    if (!bucket || !path) continue;

    const { data: downloaded, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !downloaded) continue;

    const bytes = Buffer.from(await downloaded.arrayBuffer());
    const mime = String(d.mime_type || "application/octet-stream");
    const originalName = String(d.original_filename || `document-${d.id}`);
    const type = String(d.doc_type || "unknown");

    fileBuffers.push({
      name: originalName,
      buffer: bytes,
      mimeType: mime,
      docType: type,
      originalFilename: originalName,
    });
  }

  if (fileBuffers.length === 0) {
    return new NextResponse("No downloadable documents found", { status: 404 });
  }

  // Return based on format
  if (format === "zip" || (format === "original" && fileBuffers.length > 1)) {
    // Create ZIP
    const zip = new JSZip();
    const typeLabel = docType === "all" ? "all" : docType;
    
    // Group files by doc_type for better organization in ZIP
    const grouped = fileBuffers.reduce((acc, file) => {
      const type = file.docType || "other";
      if (!acc[type]) acc[type] = [];
      acc[type].push(file);
      return acc;
    }, {} as Record<string, typeof fileBuffers>);

    // Add files to ZIP, organized by type
    for (const [type, files] of Object.entries(grouped)) {
      const folder = zip.folder(type) || zip;
      files.forEach((file, idx) => {
        const ext = file.name.includes(".") ? "" : ".bin";
        const filename = file.name.endsWith(ext) ? file.name : `${file.name}${ext}`;
        // Add index to prevent overwrites
        const uniqueName = files.length > 1 ? `${idx + 1}_${filename}` : filename;
        folder.file(uniqueName, file.buffer);
      });
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename=employee-${employeeId}-${typeLabel}-documents.zip`,
        "cache-control": "no-store",
      },
    });
  }

  // Default: Combine into single PDF
  const outPdf = await PDFDocument.create();
  const legalW = 8.5 * 72;
  const legalH = 13 * 72;

  for (const file of fileBuffers) {
    try {
      const isPdf = file.mimeType === "application/pdf";
      
      if (isPdf) {
        // Embed PDF pages
        const srcPdf = await PDFDocument.load(file.buffer);
        const pages = await outPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        pages.forEach((page) => outPdf.addPage(page));
      } else if (file.mimeType.startsWith("image/")) {
        // Embed image
        let img;
        if (file.mimeType === "image/png") {
          img = await outPdf.embedPng(file.buffer);
        } else if (file.mimeType === "image/jpeg" || file.mimeType === "image/jpg") {
          img = await outPdf.embedJpg(file.buffer);
        } else {
          // Skip unsupported image types
          continue;
        }
        
        const page = outPdf.addPage([legalW, legalH]);
        const scale = Math.min(legalW / img.width, legalH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (legalW - w) / 2;
        const y = (legalH - h) / 2;
        page.drawImage(img, { x, y, width: w, height: h });
      }
    } catch (e) {
      console.error(`Failed to add file ${file.name} to PDF:`, e);
    }
  }

  const out = await outPdf.save();
  const typeLabel = docType === "all" ? "all" : docType;
  
  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=employee-${employeeId}-${typeLabel}-combined.pdf`,
      "cache-control": "no-store",
    },
  });
}
