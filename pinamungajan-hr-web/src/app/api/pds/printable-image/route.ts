import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { detectPdsTemplateVersionFromText } from "@/lib/pds/templateDetect";
import { normalizeScanToLegal } from "@/lib/pds/normalizeScanToLegal";

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
  const extractionId = String(url.searchParams.get("extraction_id") || "").trim();
  const pageParam = Number(url.searchParams.get("page") || "1");
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const enhance = url.searchParams.get("enhance") !== "0";

  if (!extractionId) {
    return new NextResponse("Missing extraction_id", { status: 400 });
  }

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, raw_extracted_json")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction?.document_id) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

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

  const cookieStore = await cookies();
  const normCookie = cookieStore.get("pds_normalize_legal")?.value;
  const normalizeEnabled = normCookie === null || normCookie === undefined ? true : normCookie === "1";

  const raw = (extraction as any)?.raw_extracted_json || {};
  const ocrText = String((raw as any)?.text || "");
  const detected = detectPdsTemplateVersionFromText(ocrText);
  const isPds = detected.version !== "unknown";

  const wantNormalize = normalizeEnabled && isPds;

  const cacheBucket = String(doc.storage_bucket);
  const cachePath = `normalized/pds-legal/${extractionId}/page-${page}-dpi300.png`;

  if (wantNormalize) {
    const { data: cached } = await supabase.storage.from(cacheBucket).download(cachePath);
    if (cached) {
      const buf = Buffer.from(await cached.arrayBuffer());
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-disposition": `attachment; filename=scan-${extractionId}-page${page}-LEGAL.png`,
          "cache-control": "no-store",
        },
      });
    }

    const norm = await normalizeScanToLegal({
      bytes: originalBytes,
      mimeType: mime,
      pageIndex: page - 1,
      dpi: 300,
      enhance,
    });

    await supabase.storage.from(cacheBucket).upload(cachePath, norm.buffer, {
      contentType: "image/png",
      upsert: true,
    });

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

    return new NextResponse(Buffer.from(norm.buffer), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-disposition": `attachment; filename=scan-${extractionId}-page${page}-LEGAL.png`,
        "cache-control": "no-store",
      },
    });
  }

  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return new NextResponse("sharp not installed", { status: 500 });
  }

  const density = 300;
  const input = mime === "application/pdf" ? sharp(originalBytes, { density, page: page - 1 }) : sharp(originalBytes);

  const pipeline = enhance
    ? input.rotate().normalise().sharpen({ sigma: 1 })
    : input.rotate();

  const png = await pipeline.png().toBuffer();

  return new NextResponse(Buffer.from(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename=scan-${extractionId}-page${page}.png`,
      "cache-control": "no-store",
    },
  });
}
