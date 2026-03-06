import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { detectPdsTemplateVersionFromText } from "@/lib/pds/templateDetect";
import { normalizeScanToLegal } from "@/lib/pds/normalizeScanToLegal";

export const runtime = "nodejs";

function svgRect(x: number, y: number, w: number, h: number, stroke: string, width = 4, dash?: string) {
  const dashAttr = dash ? `stroke-dasharray=\"${dash}\"` : "";
  return `<rect x=\"${x}\" y=\"${y}\" width=\"${w}\" height=\"${h}\" fill=\"none\" stroke=\"${stroke}\" stroke-width=\"${width}\" ${dashAttr} />`;
}

function svgText(x: number, y: number, text: string, fill: string, size = 18) {
  const t = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<text x=\"${x}\" y=\"${y}\" font-family=\"ui-sans-serif,system-ui\" font-size=\"${size}\" fill=\"${fill}\">${t}</text>`;
}

function normToPx(b: any, W: number, H: number) {
  if (!b) return null;
  const x = Math.max(0, Math.floor(Number(b.x || 0) * W));
  const y = Math.max(0, Math.floor(Number(b.y || 0) * H));
  const w = Math.max(1, Math.floor(Number(b.w || 0) * W));
  const h = Math.max(1, Math.floor(Number(b.h || 0) * H));
  return { x, y, w, h };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const extractionId = String(url.searchParams.get("extraction_id") || "").trim();
  if (!extractionId) return new NextResponse("Missing extraction_id", { status: 400 });

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction?.document_id) return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });

  const debugPhoto = (extraction as any)?.raw_extracted_json?.debug?.photo || null;
  const pageIndex = debugPhoto?.pageIndex === null || debugPhoto?.pageIndex === undefined ? 0 : Number(debugPhoto.pageIndex);
  const page = Math.max(1, Number.isFinite(pageIndex) ? pageIndex + 1 : 1);

  const { data: doc, error: docErr } = await supabase
    .from("employee_documents")
    .select("storage_bucket, storage_path, mime_type")
    .eq("id", extraction.document_id)
    .single();

  if (docErr || !doc?.storage_bucket || !doc?.storage_path) return new NextResponse(docErr?.message || "Document not found", { status: 404 });

  const { data: downloaded, error: dlErr } = await supabase.storage.from(String(doc.storage_bucket)).download(String(doc.storage_path));
  if (dlErr || !downloaded) return new NextResponse(dlErr?.message || "Failed to download original", { status: 400 });

  const originalBytes = Buffer.from(await downloaded.arrayBuffer());
  const mime = String(doc.mime_type || "");
  const raw = (extraction as any)?.raw_extracted_json || {};
  const ocrText = String((raw as any)?.text || "");
  const detected = detectPdsTemplateVersionFromText(ocrText);
  const isPds = detected.version !== "unknown";

  // Always normalize for debug overlay to match extraction.
  const norm = isPds
    ? await normalizeScanToLegal({ bytes: originalBytes, mimeType: mime, pageIndex: page - 1, dpi: 300, enhance: true })
    : { buffer: originalBytes, debug: { warnings: ["not_pds"], outputPx: { w: 0, h: 0 } } };

  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return new NextResponse("sharp not installed", { status: 500 });
  }

  const base = await sharp(norm.buffer).png().toBuffer();
  const meta = await sharp(base).metadata();
  const W = Number(meta.width || 0);
  const H = Number(meta.height || 0);
  if (!W || !H) return new NextResponse("Invalid image", { status: 500 });

  const coarse = normToPx(debugPhoto?.coarseWindow, W, H);
  const chosen = normToPx(debugPhoto?.roi, W, H);
  const photoLabel = normToPx(debugPhoto?.photoLabelBox, W, H);
  const thumbLabel = normToPx(debugPhoto?.thumbmarkLabelBox, W, H);
  const candidates = Array.isArray(debugPhoto?.candidates) ? debugPhoto.candidates : [];
  const tier = debugPhoto?.tierUsed ? String(debugPhoto.tierUsed) : "";
  const tierAFail = Array.isArray(debugPhoto?.tierAFailedReasons) ? (debugPhoto.tierAFailedReasons as any[]).join(",") : "";

  let svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${W}\" height=\"${H}\">`;
  svg += `<rect x=\"0\" y=\"0\" width=\"760\" height=\"92\" fill=\"rgba(255,255,255,0.78)\" />`;
  svg += svgText(12, 30, `page=${page} tier=${tier || "?"}`, "#0f172a", 22);
  if (tierAFail) svg += svgText(12, 58, `tierA_fail=${tierAFail}`, "#334155", 16);
  const top3 = candidates.slice(0, 3).map((c: any) => Number(c?.score || 0).toFixed(2)).join(" ");
  if (top3) svg += svgText(12, 82, `top_scores=${top3}`, "#334155", 16);
  if (coarse) svg += svgRect(coarse.x, coarse.y, coarse.w, coarse.h, "#f59e0b", 6, "12 10");

  if (photoLabel) svg += svgRect(photoLabel.x, photoLabel.y, photoLabel.w, photoLabel.h, "#a855f7", 5, "6 6");
  if (thumbLabel) svg += svgRect(thumbLabel.x, thumbLabel.y, thumbLabel.w, thumbLabel.h, "#ef4444", 5, "6 6");

  // candidates
  for (let i = 0; i < Math.min(10, candidates.length); i++) {
    const px = normToPx(candidates[i]?.roi, W, H);
    if (!px) continue;
    svg += svgRect(px.x, px.y, px.w, px.h, "#60a5fa", 4, "8 6");
    svg += svgText(px.x + 6, Math.max(18, px.y + 20), `#${i + 1}`, "#1d4ed8", 18);
  }

  if (chosen) {
    svg += svgRect(chosen.x, chosen.y, chosen.w, chosen.h, "#22c55e", 7);
    svg += svgText(chosen.x + 6, Math.max(20, chosen.y - 8), "CHOSEN", "#16a34a", 20);
  }
  svg += `</svg>`;

  const out = await sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return new NextResponse(out, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename=photo-debug-${extractionId}-page${page}.png`,
      "cache-control": "no-store",
    },
  });
}
