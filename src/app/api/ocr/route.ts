import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDocumentAiClient, getProcessorName } from "@/lib/gcp/documentAi";
import { extractOwnerFromTokensRoi } from "@/lib/pds2025/tokenRoiExtract";
import { detectPdsTemplateVersionFromText } from "@/lib/pds/templateDetect";
import { extractOwnerByAnchors } from "@/lib/pds/anchorOwnerExtract";
import { extractOwnerFromTokensRoi2018 } from "@/lib/pds2018/tokenRoiExtract";
import { computeAgeAndGroupFromDobIso } from "@/lib/age";
import { getDocumentAiTokens } from "@/lib/pds/documentAiTokens";
import { extractSexAtBirth } from "@/lib/pds/sexAtBirthExtract";
import { buildSearchablePdfFromOriginalAndTokens } from "@/lib/pds/searchablePdf";
import { extractDobFromPersonalInfoRow } from "@/lib/pds/dobRowExtract";
import { parsePdsDobToIso, safeParseDateToIso, validateDobToIso, validatePersonName } from "@/lib/pds/validators";
import { revalidatePath } from "next/cache";
import { preprocessPdsPage } from "@/lib/pds/preprocessPdsPage";
import { applyGlobal, sanitizeBox, type MapJsonV2, type NormBox } from "@/lib/pds2025/mappingSchema";
import {
  cropPhotoFromNormalizedPng,
  cropPhotoFromFrameNormalizedPng,
  findPhotoFrameCandidatesByVision,
  roiCandidatesFromPhotoToken,
  roiFromPhotoToken,
  scorePhotoPageFromTextAndTokens,
  type PhotoExtractDebug,
} from "@/lib/pds/photoExtract";
import { uploadPhotoWithBucketFallback, PRIMARY_PHOTO_BUCKET, FALLBACK_PHOTO_BUCKET } from "@/lib/supabase/storageFallback";
import { PDFDocument } from "pdf-lib";
import { detectDocumentType, type DocumentType, getDocumentCategory } from "@/lib/document/detection";
import { extractAppointmentFields, parseAppointmentDate } from "@/lib/appointment/fieldExtract";
import { extractPdsOwnerFromTextFallback } from "@/lib/ownerDetect/pdsOwner";

export const runtime = "nodejs";

function normalizeNameForMatch(s: string) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenTextUpper(t: any) {
  return String(t?.text || "").trim().toUpperCase();
}

function tokenHeight(t: any) {
  const b = t?.box;
  return b ? Math.max(0, Number(b.maxY || 0) - Number(b.minY || 0)) : 0;
}

function pickBestPhotoLabelToken(tokens: any[]) {
  const candidates = (tokens || [])
    .filter((t) => tokenTextUpper(t) === "PHOTO")
    .filter((t) => (t?.box?.midX ?? 0) > 0.55)
    .filter((t) => (t?.box?.midY ?? 0) > 0.45)
    .filter((t) => tokenHeight(t) >= 0.006);

  candidates.sort((a, b) => {
    const ax = Number(a?.box?.midX || 0);
    const bx = Number(b?.box?.midX || 0);
    if (bx !== ax) return bx - ax;
    const ay = Number(a?.box?.midY || 0);
    const by = Number(b?.box?.midY || 0);
    return by - ay;
  });
  return candidates[0] || null;
}

function looksLikePlaceholderName(s: string) {
  const u = String(s || "").toUpperCase().trim();
  if (!u) return true;
  if (["N/A", "NA", "NONE", "NULL", "UNKNOWN", "NOT AVAILABLE"].includes(u)) return true;
  // Common OCR junk that becomes employee records.
  if (/\b(YYYY|MM|DD)\b/.test(u)) return true;
  if (/\bMM\s*DD\s*YYYY\b/.test(u)) return true;
  if (/\b\d{4}\b/.test(u) && /\b\d{1,2}\b/.test(u)) return true;
  return false;
}

function formatValidation(which: string, res: { ok: boolean; reasons: string[] }) {
  if (res.ok) return null;
  return `${which}:${res.reasons.join(",")}`;
}

function isSupportedMimeType(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ocr" });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

  async function buildMultipagePdfFromImages(
    pages: Array<{ bytes: Buffer; mimeType: string; pageIndex: number | null; filename: string | null }>
  ): Promise<{ pdfBytes: Buffer; pageCount: number; pageIndexesUsed: number[] }> {
    let sharpMod: any;
    try {
      sharpMod = (await import("sharp")).default;
    } catch {
      throw new Error("sharp not installed");
    }

    const pdf = await PDFDocument.create();
    const pageIndexesUsed: number[] = [];

    for (const p of pages) {
      const mt = String(p.mimeType || "").toLowerCase();
      if (mt === "application/pdf") {
        throw new Error("Batch contains a PDF; upload only images for multi-page OCR");
      }
      if (!mt.startsWith("image/")) {
        throw new Error(`Unsupported page mime type in batch: ${p.mimeType}`);
      }

      // Convert to PNG for deterministic embed + metadata.
      const pngBytes = await sharpMod(p.bytes).png().toBuffer();
      const img = await pdf.embedPng(pngBytes);
      const w = img.width;
      const h = img.height;
      const page = pdf.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
      if (typeof p.pageIndex === "number" && Number.isFinite(p.pageIndex)) pageIndexesUsed.push(p.pageIndex);
    }

    const out = await pdf.save();
    return { pdfBytes: Buffer.from(out), pageCount: pdf.getPageCount(), pageIndexesUsed };
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 });
  }

  const extractionId = String(body.extraction_id || "");
  if (!extractionId) {
    return new NextResponse("Missing extraction_id", { status: 400 });
  }

  const { data: extraction, error: exErr } = await supabase
    .from("extractions")
    .select("id, document_id, batch_id, page_index, document_set_id, doc_type_user_selected")
    .eq("id", extractionId)
    .single();

  if (exErr || !extraction?.document_id) {
    return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
  }

  async function downloadDocBytes(docRow: any) {
    const { data: downloaded, error: downloadErr } = await supabase.storage
      .from(String(docRow.storage_bucket))
      .download(String(docRow.storage_path));

    if (downloadErr || !downloaded) {
      throw new Error(downloadErr?.message || "Failed to download file from storage");
    }
    return Buffer.from(await downloaded.arrayBuffer());
  }

  async function loadBatchDocuments(): Promise<
    Array<{
      document_id: string;
      batch_id: string | null;
      page_index: number | null;
      doc: any;
    }>
  > {
    const documentSetId = (extraction as any)?.document_set_id ? String((extraction as any).document_set_id) : null;
    if (documentSetId) {
      const { data: docs, error: docsErr } = await supabase
        .from("employee_documents")
        .select("id, storage_bucket, storage_path, mime_type, original_filename, batch_id, page_index, document_set_id")
        .eq("document_set_id", documentSetId)
        .order("page_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (docsErr) throw new Error(docsErr.message);
      return (docs || []).map((d: any) => ({
        document_id: String(d.id),
        batch_id: d.batch_id ? String(d.batch_id) : null,
        page_index: typeof d.page_index === "number" ? Number(d.page_index) : null,
        doc: d,
      }));
    }

    const batchId = (extraction as any)?.batch_id ? String((extraction as any).batch_id) : null;
    if (!batchId) {
      if (!extraction?.document_id) throw new Error("Extraction missing document_id");
      const { data: doc, error: docErr } = await supabase
        .from("employee_documents")
        .select("id, storage_bucket, storage_path, mime_type, original_filename, batch_id, page_index, document_set_id")
        .eq("id", extraction.document_id)
        .single();
      if (docErr || !doc?.storage_bucket || !doc?.storage_path) throw new Error(docErr?.message || "Document not found");
      return [
        {
          document_id: String(doc.id),
          batch_id: doc.batch_id ? String(doc.batch_id) : null,
          page_index: typeof doc.page_index === "number" ? Number(doc.page_index) : null,
          doc,
        },
      ];
    }

    const { data: docs, error: docsErr } = await supabase
      .from("employee_documents")
      .select("id, storage_bucket, storage_path, mime_type, original_filename, batch_id, page_index, document_set_id")
      .eq("batch_id", batchId)
      .order("page_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (docsErr) throw new Error(docsErr.message);

    return (docs || []).map((d: any) => ({
      document_id: String(d.id),
      batch_id: d.batch_id ? String(d.batch_id) : null,
      page_index: typeof d.page_index === "number" ? Number(d.page_index) : null,
      doc: d,
    }));
  }

  function scorePage1FromText(text: string) {
    const u = String(text || "").toUpperCase();
    let score = 0;
    if (u.includes("PERSONAL DATA SHEET")) score += 50;
    if (u.includes("CS FORM") && u.includes("212")) score += 60;
    if (u.includes("PERSONAL") && u.includes("INFORMATION")) score += 80;
    if (u.includes("SURNAME")) score += 35;
    if (u.includes("FIRST") && u.includes("NAME")) score += 20;
    if (u.includes("MIDDLE") && u.includes("NAME")) score += 20;
    if (u.includes("DATE") && u.includes("BIRTH")) score += 20;
    if (u.includes("SEX")) score += 10;
    return score;
  }

  const batchDocs = await loadBatchDocuments();
  if (batchDocs.length === 0) return new NextResponse("No documents found", { status: 404 });

  let client: any;
  let name = "";
  try {
    client = createDocumentAiClient();
    name = getProcessorName();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(
      JSON.stringify({
        error: "OCR is not configured",
        details: msg,
        suggestion:
          "Set Vercel Environment Variables for Google Document AI: GCP_SERVICE_ACCOUNT_JSON, DOCUMENT_AI_LOCATION, DOCUMENT_AI_PROCESSOR_ID (and optionally GCP_PROJECT_ID). Then redeploy.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const pages: Array<{
    document_id: string;
    batch_id: string | null;
    page_index: number | null;
    originalBytes: Buffer;
    originalMimeType: string;
    processedPng: Buffer;
    preprocessDebug: any;
    filename: string | null;
  }> = [];

  // PERF: For PDS extraction we only need page 1 (personal information section).
  // Processing all pages can take a very long time and cause the UI to appear hung.
  const userSelectedTypeForOcrPaging = (extraction as any)?.doc_type_user_selected;
  const maxOcrPages = userSelectedTypeForOcrPaging === "appointment" ? 3 : 1;
  for (const row of batchDocs.slice(0, maxOcrPages)) {
    const doc = row.doc;
    if (!doc?.storage_bucket || !doc?.storage_path) continue;
    const mimeType = String(doc.mime_type || "application/octet-stream");
    if (!isSupportedMimeType(mimeType)) continue;
    const originalBytes = await downloadDocBytes(doc);
    const processed = await preprocessPdsPage({ bytes: originalBytes, mimeType, pageIndex: 0, dpi: 300 });
    pages.push({
      document_id: String(row.document_id),
      batch_id: row.batch_id,
      page_index: row.page_index,
      originalBytes,
      originalMimeType: mimeType,
      processedPng: processed.buffer,
      preprocessDebug: processed.debug,
      filename: doc.original_filename ? String(doc.original_filename) : null,
    });
  }

  if (pages.length === 0) return new NextResponse("No supported documents to OCR", { status: 400 });

  const sortedPages = pages
    .slice()
    .sort((a, b) => (Number(a.page_index ?? 1e9) - Number(b.page_index ?? 1e9)) || String(a.document_id).localeCompare(String(b.document_id)));

  const pdfBuild = await buildMultipagePdfFromImages(
    sortedPages.map((p) => ({ bytes: p.processedPng, mimeType: "image/png", pageIndex: p.page_index, filename: p.filename }))
  );

  let docAiResult: any;
  
  // FAST TIMEOUT: Don't let OCR hang for hours
  const DOC_AI_TIMEOUT = 30000; // 30 seconds max
  
  try {
    // Use the client-native timeout so the underlying request is actually cancelled.
    const processedDoc = await (client as any).processDocument(
      {
        name,
        rawDocument: {
          content: pdfBuild.pdfBytes,
          mimeType: "application/pdf",
        },
      },
      { timeout: DOC_AI_TIMEOUT }
    );

    docAiResult = processedDoc?.[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OCR] Document AI failed:", msg);
    
    // QUICK FALLBACK: Skip slow Tesseract, just use basic metadata
    // This prevents the 1-hour hang
    await supabase
      .from("extractions")
      .update({
        status: "error",
        errors: { ocr: `Document AI failed: ${msg}. Please try again or check your Google Cloud credentials.` },
        updated_by: user.id,
      } as any)
      .eq("id", extractionId);
    
    return new NextResponse(
      JSON.stringify({ 
        error: "OCR failed", 
        details: msg,
        suggestion: "Document AI is taking too long or failing. Check your internet connection and Google Cloud credentials."
      }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const document = docAiResult?.document;
  const fullTextAll = document?.text || "";
  const tokensAll = getDocumentAiTokens(document);
  const pageCount = Array.isArray(document?.pages) ? document.pages.length : 0;

  function pageTextFromTokens(pageIndex: number) {
    const toks = tokensAll.filter((t) => Number(t.pageIndex) === pageIndex);
    return toks
      .map((t) => String((t as any).text || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  const pageViews = sortedPages.map((p, i) => {
    const pageIndex = i;
    const pageText = pageTextFromTokens(pageIndex);
    const template = detectPdsTemplateVersionFromText(pageText);
    const page1Score = scorePage1FromText(pageText);
    return {
      pageIndex,
      pageText,
      tokens: tokensAll.filter((t) => Number(t.pageIndex) === pageIndex),
      template,
      page1Score,
      page: p,
    };
  });

  const page1 = pageViews.slice().sort((a, b) => b.page1Score - a.page1Score)[0];
  const chosenExtractionId = String(extractionId);
  const chosenPageIndex = page1?.page?.page_index ?? null;

  // Owner/DOB extraction helpers currently assume pageIndex=0 in the Document AI output.
  // Build a page-local "document" view for the chosen page by reindexing it to 0.
  const chosenPageDocAiIndex = Number(page1?.pageIndex ?? 0);
  const page1Doc: any = {
    ...(document || {}),
    pages: Array.isArray((document as any)?.pages)
      ? [((document as any).pages || [])[chosenPageDocAiIndex]].filter(Boolean)
      : [],
    // IMPORTANT: Keep the original full-text so textAnchor indices remain valid.
    // We only subset pages to make chosen page become pageIndex=0 for downstream extractors.
    text: fullTextAll,
  };

  const templateAcross = (() => {
    const nonUnknown = pageViews.find((r) => r.template.version !== "unknown");
    return nonUnknown?.template ?? (page1?.template ?? detectPdsTemplateVersionFromText(fullTextAll));
  })();

  async function loadMapBox(templateVersion: string, pageNumber: number, fieldId: string): Promise<NormBox | null> {
    try {
      const { data: rows } = await supabase
        .from("pds_template_maps")
        .select("map_json")
        .eq("template_version", templateVersion)
        .eq("page", pageNumber)
        .order("updated_at", { ascending: false })
        .limit(1);

      const mj = (rows || [])[0]?.map_json as any;
      if (!mj || typeof mj !== "object") return null;

      // v2 schema: fields[] + transform
      if (mj.schema_version === 2 && Array.isArray(mj.fields)) {
        const map = mj as MapJsonV2;
        const f = (map.fields || []).find((x: any) => x && typeof x === "object" && x.id === fieldId);
        const b = f?.box;
        if (!b || typeof b !== "object") return null;
        const raw: NormBox = {
          x: Number(b.x),
          y: Number(b.y),
          w: Number(b.w),
          h: Number(b.h),
        };
        if (![raw.x, raw.y, raw.w, raw.h].every((n) => Number.isFinite(n))) return null;
        return sanitizeBox(applyGlobal(raw, map.transform));
      }

      // Legacy map shape: map_json.fields.<fieldId> = NormBox (already global)
      const legacyBox = (mj?.fields && typeof mj.fields === "object" ? (mj.fields as any)[fieldId] : null) as any;
      if (legacyBox && typeof legacyBox === "object") {
        const raw: NormBox = {
          x: Number(legacyBox.x),
          y: Number(legacyBox.y),
          w: Number(legacyBox.w),
          h: Number(legacyBox.h),
        };
        if (![raw.x, raw.y, raw.w, raw.h].every((n) => Number.isFinite(n))) return null;
        return sanitizeBox(raw);
      }

      return null;
    } catch {
      return null;
    }
  }

  // STRICT DOCUMENT TYPE ROUTING
  // A) APPOINTMENT: Extract appointment fields ONLY, update masterlist job fields
  // B) PDS: Extract personal info ONLY (name, DOB, sex), NO job fields
  // C) ALL OTHER TYPES: Store file only, NO OCR extraction
  
  const userSelectedType = (extraction as any)?.doc_type_user_selected;
  const isAutoDetect = !userSelectedType || userSelectedType === "auto-detect";
  
  let docTypeResult = detectDocumentType(fullTextAll);
  let docTypeDetected = docTypeResult.type;
  let docTypeFinal: DocumentType | string = docTypeDetected;
  let docTypeMismatchWarning = false;
  let mismatchDetails: any = null;
  
  if (!isAutoDetect) {
    // User selected a specific type - use it
    docTypeFinal = userSelectedType;
    
    // Run sanity check: detect actual type and compare
    if (docTypeDetected !== userSelectedType && docTypeResult.confidence > 0.7) {
      docTypeMismatchWarning = true;
      mismatchDetails = {
        userSelected: userSelectedType,
        detected: docTypeDetected,
        confidence: docTypeResult.confidence,
        evidence: docTypeResult.evidence,
      };
    }
  }
  
  // Validate that final type is one we handle, otherwise treat as "other"
  const supportedTypes: DocumentType[] = ["pds", "appointment", "oath", "assumption", "certification_lgu", "nosa", "nosi", "ipcr", "service_record", "training", "eligibility", "other"];
  if (!supportedTypes.includes(docTypeFinal as DocumentType)) {
    docTypeFinal = "other";
  }

  // === TYPE A: APPOINTMENT - Full appointment extraction + masterlist update ===
  let appointmentData: any = null;
  let appointmentDebug: any = null;
  let ownerCandidate: any = null;
  let ownerEmployeeId: string | null = null;
  let ownerLinkWarning: string | null = null;
  let searchablePdf: any = null;
  let searchablePdfWarning: string | null = null;
  let photoDebug: any = { warnings: [] };
  
  // Variables for extraction debug (initialized for all types)
  let anchor: any = null;
  let roi: any = null;
  let sex: any = { value: null, debug: { method: null, male: null, female: null, densities: null, imageRois: null, reasons: [] } };
  let dobRow: any = { iso: null, debug: { rawDateMatch: null, usedRule: null, reasonsIfNull: [] } };
  let rawDobCandidate: string = "";
  let dobParsed: any = { iso: null, detectedFormat: "unknown", confidence: 0, reasonsIfNull: [] };

  if (docTypeFinal === "appointment") {
    const appointmentPage = pageViews[0];
    const appointmentDoc: any = {
      ...(document || {}),
      pages: Array.isArray((document as any)?.pages)
        ? [((document as any).pages || [])[0]].filter(Boolean)
        : [],
      text: fullTextAll,
      tokens: appointmentPage?.tokens || [],
    };

    const evidenceDatesRaw: string[] = [];
    for (const p of pageViews) {
      const t = String((p as any).pageText || "");
      if (!t) continue;
      const matches = t.match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/g) || [];
      for (const m of matches) {
        if (evidenceDatesRaw.length >= 30) break;
        evidenceDatesRaw.push(m);
      }
      if (evidenceDatesRaw.length >= 30) break;
    }

    const appointmentResult = extractAppointmentFields(appointmentDoc, {
      pageIndex: appointmentPage?.page?.page_index ?? 0,
      evidenceDates: evidenceDatesRaw,
    });

    appointmentData = {
      owner: appointmentResult.owner,
      position_title: appointmentResult.position_title,
      office_department: appointmentResult.office_department,
      sg: appointmentResult.sg,
      step: appointmentResult.step,
      monthly_salary: appointmentResult.monthly_salary,
      annual_salary: appointmentResult.annual_salary,
      appointment_date: appointmentResult.appointment_date,
      date_received: appointmentResult.date_received,
      nature_of_appointment: appointmentResult.nature_of_appointment,
      status: appointmentResult.status,
      sg_from_salary: appointmentResult.sg_from_salary,
    };
    appointmentDebug = appointmentResult.debug;

    // Use appointment-extracted owner
    if (appointmentData?.owner) {
      ownerCandidate = {
        last_name: appointmentData.owner.last_name,
        first_name: appointmentData.owner.first_name,
        middle_name: appointmentData.owner.middle_name,
        confidence: 0.9,
      };
    }

    // Link employee and update masterlist appointment fields
    if (ownerCandidate) {
      const last = String(ownerCandidate.last_name || "").trim();
      const first = String(ownerCandidate.first_name || "").trim();
      
      if (last && first) {
        const normKey = normalizeNameForMatch(`${last} ${first} ${ownerCandidate.middle_name || ""}`);
        
        const { data: candidates } = await supabase
          .from("employees")
          .select("id, last_name, first_name, middle_name, date_of_birth, gender, age, age_group, position_title, sg, office_department, monthly_salary, annual_salary, date_hired")
          .ilike("last_name", last)
          .ilike("first_name", first)
          .limit(25);

        const filtered = (candidates || []).filter((c: any) => {
          const cKey = normalizeNameForMatch(`${c.last_name || ""} ${c.first_name || ""} ${c.middle_name || ""}`);
          return cKey === normKey;
        });

        if (filtered.length === 1) {
          ownerEmployeeId = String(filtered[0].id);
          
          // Update masterlist with appointment fields (ONLY appointment updates these)
          const patch: any = {};
          if (appointmentData.position_title) patch.position_title = appointmentData.position_title;
          if (appointmentData.office_department) patch.office_department = appointmentData.office_department;
          if (appointmentData.sg) patch.sg = appointmentData.sg;
          if (appointmentData.step) patch.step = appointmentData.step;
          if (appointmentData.monthly_salary) patch.monthly_salary = appointmentData.monthly_salary;
          if (appointmentData.annual_salary) patch.annual_salary = appointmentData.annual_salary;
          
          if (appointmentData.appointment_date) {
            patch.date_hired = appointmentData.appointment_date;
            const hireDate = new Date(appointmentData.appointment_date);
            const now = new Date();
            const diffMs = now.getTime() - hireDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            patch.tenure_years = Math.floor(diffDays / 365);
            patch.tenure_months = Math.floor((diffDays % 365) / 30);
          }
          
          if (Object.keys(patch).length > 0) {
            await supabase.from("employees").update(patch).eq("id", ownerEmployeeId);
          }
        } else if (filtered.length > 1) {
          ownerLinkWarning = `Multiple matches found (${filtered.length}). Please confirm correct employee.`;
        } else {
          ownerLinkWarning = "No matching employee found. Create new employee to link.";
        }
      }
    }
  }

  // === TYPE B: PDS - Personal info extraction ONLY (no job fields) ===
  if (docTypeFinal === "pds") {
    const page1TemplateVersion = templateAcross.version;
    console.log("[DEBUG PDS] Starting PDS extraction, template version:", page1TemplateVersion);
    
    const anchor = extractOwnerByAnchors(page1Doc, { templateVersion: page1TemplateVersion });
    console.log("[DEBUG PDS] Anchor extraction result:", {
      hasOwner: !!anchor.owner,
      owner: anchor.owner,
      debug: anchor.debug,
    });
    
    const roi =
      page1TemplateVersion === "2018"
        ? extractOwnerFromTokensRoi2018(page1Doc)
        : page1TemplateVersion === "2025"
          ? extractOwnerFromTokensRoi(page1Doc)
          : { owner: null, debug: null };
    
    console.log("[DEBUG PDS] ROI extraction result:", {
      hasOwner: !!(roi as any).owner,
      owner: (roi as any).owner,
    });

    ownerCandidate = anchor.owner ?? (roi as any).owner ?? null;
    console.log("[DEBUG PDS] Combined owner candidate:", ownerCandidate);
    
    // FALLBACK: Use text-based regex extraction if anchor/ROI failed
    if (!ownerCandidate) {
      console.log("[DEBUG PDS] Anchor/ROI extraction failed, trying text fallback...");
      const fallbackOwner = extractPdsOwnerFromTextFallback(fullTextAll);
      console.log("[DEBUG PDS] Fallback extraction result:", fallbackOwner);
      if (fallbackOwner) {
        ownerCandidate = fallbackOwner;
      }
    }

    const dobRow = extractDobFromPersonalInfoRow(page1Doc, { templateVersion: page1TemplateVersion });
    console.log("[DEBUG PDS] DOB extraction result:", dobRow);
    
    if (dobRow.iso && ownerCandidate) {
      ownerCandidate = {
        ...ownerCandidate,
        date_of_birth: dobRow.iso,
        confidence: Math.max((ownerCandidate as any).confidence ?? 0, 0.99),
      };
    }

    const sex = await extractSexAtBirth(page1Doc, {
      templateVersion: page1TemplateVersion,
      originalMimeType: "image/png",
      originalBytes: page1?.page?.processedPng,
    });
    console.log("[DEBUG PDS] Sex extraction result:", sex);

    if (ownerCandidate && sex.value && !(ownerCandidate as any).gender) {
      (ownerCandidate as any).gender = sex.value;
    }

    // Strict validation - but allow fallback results with lower confidence
    if (ownerCandidate) {
      const vLast = validatePersonName(String((ownerCandidate as any).last_name || ""), "last");
      const vFirst = validatePersonName(String((ownerCandidate as any).first_name || ""), "first");
      console.log("[DEBUG PDS] Validation results:", { last: vLast, first: vFirst });
      
      // If validation fails but we have a fallback candidate with confidence < 0.8, use it anyway
      const isFallback = (ownerCandidate as any).confidence < 0.8;
      
      if (!vLast.ok || !vFirst.ok) {
        if (isFallback && (ownerCandidate as any).last_name && (ownerCandidate as any).first_name) {
          console.log("[DEBUG PDS] Validation strict but keeping fallback result");
          // Keep the fallback result but log the validation issues
        } else {
          console.log("[DEBUG PDS] Validation failed - clearing owner candidate");
          ownerCandidate = null;
        }
      }
    }

    // Link employee but DO NOT update job fields (position, office, sg, salary, tenure)
    if (ownerCandidate) {
      const last = String((ownerCandidate as any).last_name || "").trim();
      const first = String((ownerCandidate as any).first_name || "").trim();
      const dobIso = String((ownerCandidate as any).date_of_birth || "").trim();

      if (last && first) {
        const normKey = normalizeNameForMatch(`${last} ${first} ${(ownerCandidate as any).middle_name || ""}`);
        
        const { data: candidates } = await supabase
          .from("employees")
          .select("id, last_name, first_name, middle_name, date_of_birth, gender, age, age_group")
          .ilike("last_name", last)
          .ilike("first_name", first)
          .limit(25);

        const filtered = (candidates || []).filter((c: any) => {
          const cKey = normalizeNameForMatch(`${c.last_name || ""} ${c.first_name || ""} ${c.middle_name || ""}`);
          if (cKey !== normKey) return false;
          if (dobIso) return String(c.date_of_birth || "") === dobIso;
          return true;
        });

        if (filtered.length === 1) {
          ownerEmployeeId = String(filtered[0].id);
          // PDS ONLY updates personal fields - NEVER job fields
          const patch: any = {};
          const detectedGender = (ownerCandidate as any).gender ?? null;
          const computedAge = dobIso ? computeAgeAndGroupFromDobIso(dobIso) : { age: null, age_group: null };
          
          if (dobIso && !filtered[0].date_of_birth) patch.date_of_birth = dobIso;
          if (detectedGender && !filtered[0].gender) patch.gender = detectedGender;
          if (computedAge.age !== null && !filtered[0].age) {
            patch.age = computedAge.age;
            patch.age_group = computedAge.age_group;
          }
          
          if (Object.keys(patch).length > 0) {
            await supabase.from("employees").update(patch).eq("id", ownerEmployeeId);
          }
        } else if (filtered.length > 1) {
          ownerLinkWarning = `Multiple matches found (${filtered.length}). Please confirm correct employee.`;
        } else {
          ownerLinkWarning = "No matching employee found. Create new employee to link.";
        }
      }
    }
  }

  // === TYPE C: ALL OTHER TYPES - Store only, skip extraction ===
  // No owner extraction, no field extraction - just file storage
  // employee_id must be set manually or via previous linking

  // Link document to employee_id if found
  if (ownerEmployeeId && page1?.page?.document_id) {
    await supabase.from("employee_documents").update({ employee_id: ownerEmployeeId }).eq("id", page1.page.document_id);
    await supabase.from("extractions").update({ linked_employee_id: ownerEmployeeId } as any).eq("id", chosenExtractionId);
  }

  // Photo extraction after ownerEmployeeId is computed (best-effort)
  try {
    const photoScores = pageViews.map((r) => {
      const s = scorePhotoPageFromTextAndTokens({ fullText: r.pageText, tokens: r.tokens as any });
      const pageIdx = typeof r.page.page_index === "number" ? Number(r.page.page_index) : null;

      const txt = String(r.pageText || "").toUpperCase();
      const hasPhoto = txt.includes("PHOTO");
      const hasThumb = txt.includes("RIGHT THUM") || txt.includes("RIGHT  THUM") || txt.includes("THUMBMARK");
      const hasSworn = txt.includes("SUBSCRIB") || txt.includes("SWORN") || txt.includes("OATH");
      const hasAdmin = txt.includes("ADMINISTER");
      const hasAnyAnchor = hasPhoto || hasThumb || hasSworn || hasAdmin;

      return {
        r,
        score: s.score,
        reasons: s.reasons,
        photoTokenCandidates: s.photoTokenCandidates,
        pageIdx,
        hasBoth: hasPhoto && hasThumb,
        hasAnyAnchor,
      };
    });

    for (const ps of photoScores) {
      photoDebug.pageScores?.push({ pageIndex: ps.pageIdx, score: ps.score, reasons: ps.reasons });
    }

    // Evaluate all eligible pages; choose best candidate across all pages.
    const eligible = photoScores.filter((p) => p.hasAnyAnchor);
    const eligibleSorted = eligible
      .slice()
      .sort((a, b) => (b.hasBoth ? 1 : 0) - (a.hasBoth ? 1 : 0) || b.score - a.score);

    type PageAttempt = {
      pageIdx: number | null;
      pageIndexDocAi: number;
      hasBoth: boolean;
      score: number;
      method: any;
      tierUsed: any;
      roi: NormBox | null;
      candidates: any[];
      cropped: any | null;
      croppedMethod: any;
      photoLabelBox: NormBox | null;
      thumbLabelBox: NormBox | null;
    };

    let bestAttempt: PageAttempt | null = null;

    for (const ps of eligibleSorted) {
      const docAiPageIndex = Number(ps.r.pageIndex);
      const processedPng = sortedPages[docAiPageIndex]?.processedPng;
      if (!processedPng) continue;

      const bestPageIdx = ps.pageIdx;
      const pageNumberForMap = bestPageIdx !== null ? bestPageIdx + 1 : 1;
      const templateVersionForMap = String((templateAcross as any)?.version ?? "unknown");

      let roiBox: NormBox | null = null;
      let photoLabelBox: NormBox | null = null;
      let thumbLabelBox: NormBox | null = null;
      const tierAFailedReasons: string[] = [];
      const tierBFailedReasons: string[] = [];
      let tierUsed: any = null;
      let method: any = null;

      const mapBox =
        templateVersionForMap !== "unknown"
          ? (await loadMapBox(templateVersionForMap, pageNumberForMap, "owner_photo_box")) ||
            (await loadMapBox(templateVersionForMap, pageNumberForMap, "owner_photo"))
          : null;

      if (mapBox) {
        roiBox = mapBox;
        method = "map";
        tierUsed = "A";
      } else {
        const bestPhotoTok = pickBestPhotoLabelToken(ps.r.tokens as any);
        if (bestPhotoTok) {
          roiBox = roiFromPhotoToken(bestPhotoTok as any);
          method = "anchor";
          tierUsed = "A";
          photoLabelBox = {
            x: (bestPhotoTok as any).box.minX,
            y: (bestPhotoTok as any).box.minY,
            w: (bestPhotoTok as any).box.maxX - (bestPhotoTok as any).box.minX,
            h: (bestPhotoTok as any).box.maxY - (bestPhotoTok as any).box.minY,
          };

          const toks = (ps.r.tokens as any[]) || [];
          const thumbs = toks.filter((t) => tokenTextUpper(t).includes("THUMB"));
          thumbs.sort((a, b) => Number(b?.box?.midX || 0) - Number(a?.box?.midX || 0));
          const tm = thumbs[0] || null;
          if (tm) {
            thumbLabelBox = {
              x: (tm as any).box.minX,
              y: (tm as any).box.minY,
              w: (tm as any).box.maxX - (tm as any).box.minX,
              h: (tm as any).box.maxY - (tm as any).box.minY,
            };
          }
        }
      }

      if (roiBox && tierUsed === "A") {
        const cx = roiBox.x + roiBox.w / 2;
        const ar = roiBox.w / Math.max(1e-6, roiBox.h);
        if (cx <= 0.55) tierAFailedReasons.push("roi_not_right_side");
        if (ar < 0.6 || ar > 1.2) tierAFailedReasons.push(`roi_bad_aspect:${ar.toFixed(2)}`);
        if (roiBox.w < 0.10 || roiBox.h < 0.10) tierAFailedReasons.push("roi_too_small");
        if (tierAFailedReasons.length > 0) {
          roiBox = null;
          method = null;
          tierUsed = null;
        }
      }

      const coarseWindow: NormBox = { x: 0.55, y: 0.35, w: 0.43, h: 0.57 };
      let visionCandidates: Array<{ roi: NormBox; score: number; reasons: string[] }> = [];
      try {
        visionCandidates = await findPhotoFrameCandidatesByVision({
          png: processedPng,
          coarseWindow,
          photoLabelBox,
          thumbmarkLabelBox: thumbLabelBox,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        tierBFailedReasons.push(`vision_failed:${msg}`);
      }

      const candidateList: Array<{ roi: NormBox; baseScore: number; baseReasons: string[]; method: any }> = [];
      if (roiBox) candidateList.push({ roi: roiBox, baseScore: 1.0, baseReasons: ["tierA_roi"], method: method || "anchor" });
      for (const v of visionCandidates) candidateList.push({ roi: v.roi, baseScore: v.score, baseReasons: v.reasons, method: "vision" });
      if (candidateList.length === 0) continue;

      const candDbg: any[] = [];
      let chosenLocal: any = null;
      let chosenCropped: any = null;
      let chosenMethod: any = null;
      for (const c of candidateList.slice(0, 10)) {
        const cropped =
          c.method === "vision"
            ? await cropPhotoFromFrameNormalizedPng({ png: processedPng, frameRoi: c.roi, insetFrac: 0.04 })
            : await cropPhotoFromNormalizedPng({ png: processedPng, roi: c.roi });

        const mean = Number((cropped as any).debug?.avgMean ?? 0);
        const stdev = Number((cropped as any).debug?.avgStdev ?? 0);
        const contrastScore = Math.max(0, Math.min(1, stdev / 40));
        const faceScore = (cropped as any).debug?.faceLike ? 1 : 0;
        const frameScore = c.method === "vision" ? Math.max(0, Math.min(1, c.baseScore / 5)) : 0.25;
        const total = c.baseScore + contrastScore * 1.2 + faceScore * 2.0;

        candDbg.push({
          roi: c.roi,
          score: total,
          frameScore,
          contrastScore,
          faceScore,
          reasons: [...c.baseReasons, `mean:${mean.toFixed(0)}`, `stdev:${stdev.toFixed(1)}`],
          faceDetected: Boolean((cropped as any).debug?.faceLike),
        });

        if (!chosenLocal || total > Number(chosenLocal.score || -1) || (cropped as any).debug?.faceLike) {
          chosenLocal = { roi: c.roi, score: total };
          chosenCropped = cropped;
          chosenMethod = c.method;
          if ((cropped as any).debug?.faceLike) break;
        }
      }

      candDbg.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
      const topScore = Number(candDbg[0]?.score || 0);

      const attempt: PageAttempt = {
        pageIdx: bestPageIdx,
        pageIndexDocAi: docAiPageIndex,
        hasBoth: Boolean(ps.hasBoth),
        score: topScore,
        method: chosenMethod === "vision" ? "vision" : (method || "anchor"),
        tierUsed: chosenMethod === "vision" ? "B" : (tierUsed || null),
        roi: chosenLocal?.roi ?? null,
        candidates: candDbg,
        cropped: chosenCropped,
        croppedMethod: chosenMethod,
        photoLabelBox,
        thumbLabelBox,
      };

      if (!bestAttempt) bestAttempt = attempt;
      else {
        const bestHasBoth = bestAttempt.hasBoth ? 1 : 0;
        const curHasBoth = attempt.hasBoth ? 1 : 0;
        if (curHasBoth > bestHasBoth || (curHasBoth === bestHasBoth && attempt.score > bestAttempt.score)) bestAttempt = attempt;
      }
    }

    if (!bestAttempt) {
      photoDebug.warnings.push("photo_page_not_confident");
    } else {
      photoDebug.pageIndex = bestAttempt.pageIdx;
      photoDebug.method = bestAttempt.method;
      photoDebug.tierUsed = bestAttempt.tierUsed;
      photoDebug.roi = bestAttempt.roi ? bestAttempt.roi : null;
      photoDebug.candidates = bestAttempt.candidates;
      photoDebug.photoLabelBox = bestAttempt.photoLabelBox;
      photoDebug.thumbmarkLabelBox = bestAttempt.thumbLabelBox;
      photoDebug.coarseWindow = { x: 0.55, y: 0.35, w: 0.43, h: 0.57 };
      photoDebug.faceDetected = Boolean((bestAttempt.cropped as any)?.debug?.faceLike);
      photoDebug.trim = (bestAttempt.cropped as any)?.debug?.trim ?? null;
      if (bestAttempt.roi) {
        photoDebug.chosen = { roi: bestAttempt.roi, method: photoDebug.method as any, faceDetected: photoDebug.faceDetected };
      }

      const allowNoFace = bestAttempt.croppedMethod === "vision" && (bestAttempt.candidates?.[0]?.contrastScore ?? 0) >= 0.35;
      const pass = Boolean((bestAttempt.cropped as any)?.debug?.faceLike) || allowNoFace;
      if (!pass) {
        photoDebug.warnings.push("no_face_and_no_strong_frame");
      } else {
        const outPath = `extractions/${chosenExtractionId}/pds_photo_${Date.now()}.jpg`;
        let uploadInfo: { bucketUsed: string; path: string; usedFallback: boolean; reason: string | null } | null = null;
        try {
          uploadInfo = await uploadPhotoWithBucketFallback({
            supabase,
            path: outPath,
            bytes: (bestAttempt.cropped as any).jpeg,
            contentType: "image/jpeg",
            upsert: true,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          photoDebug.warnings.push(`upload_failed:${msg}`);
        }
        if (uploadInfo) {
          photoDebug.bucketUsed = uploadInfo.bucketUsed;
          photoDebug.bucketReason = uploadInfo.reason;
          photoDebug.storedPath = uploadInfo.path;
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    photoDebug.warnings.push(`photo_extract_failed:${msg}`);
  }

  await supabase
    .from("extractions")
    .update({
      raw_extracted_json: {
        ...(extraction as any).raw_extracted_json,
        owner_candidate: ownerCandidate,
        searchable_pdf: searchablePdf,
        owner_employee_id: ownerEmployeeId,
        debug: {
          ...(extraction as any).raw_extracted_json?.debug,
          photo: photoDebug,
          dates: {
            ...((extraction as any).raw_extracted_json?.debug?.dates || null),
            dob: {
              raw: rawDobCandidate || null,
              iso: dobParsed.iso,
              detectedFormat: (dobParsed as any).detectedFormat ?? "unknown",
              confidence: (dobParsed as any).confidence ?? 0,
              reasonsIfNull: dobParsed.iso ? [] : ((dobParsed as any).reasonsIfNull ?? []),
            },
          },
          formFieldCount: null,
          tokenCount: page1.tokens?.length ?? null,
          ownerMethod: ownerCandidate ? ((anchor as any)?.owner ? "anchor" : (roi as any)?.owner ? "roi" : "appointment_extraction") : null,
          ownerLinkWarning,
          owner: {
            methodUsed: ownerCandidate ? ((anchor as any)?.owner ? "anchor" : (roi as any)?.owner ? "roi" : "appointment_extraction") : null,
            pageChosen: { extraction_id: chosenExtractionId, page_index: chosenPageIndex },
            personalInfoRangeY: (anchor as any)?.debug?.personalInfoRangeY ?? null,
            labelCandidates: (anchor as any)?.debug?.fields
              ? {
                  surname: (anchor as any).debug.fields.surname.allCandidates ?? null,
                  first_name: (anchor as any).debug.fields.first_name.allCandidates ?? null,
                  middle_name: (anchor as any).debug.fields.middle_name.allCandidates ?? null,
                  date_of_birth: (anchor as any).debug.fields.date_of_birth.allCandidates ?? null,
                }
              : null,
            chosenCandidates: (anchor as any)?.debug?.fields
              ? {
                  surname: (anchor as any).debug.fields.surname.chosenCandidate ?? null,
                  first_name: (anchor as any).debug.fields.first_name.chosenCandidate ?? null,
                  middle_name: (anchor as any).debug.fields.middle_name.chosenCandidate ?? null,
                  date_of_birth: (anchor as any).debug.fields.date_of_birth.chosenCandidate ?? null,
                }
              : null,
            selectedTokens: (anchor as any)?.debug?.fields
              ? {
                  surname: (anchor as any).debug.fields.surname.selectedTokens ?? null,
                  first_name: (anchor as any).debug.fields.first_name.selectedTokens ?? null,
                  middle_name: (anchor as any).debug.fields.middle_name.selectedTokens ?? null,
                  date_of_birth: (anchor as any).debug.fields.date_of_birth.selectedTokens ?? null,
                }
              : null,
            validationReasons: (page1 as any).__ownerValidationReasons ?? null,
          },
          sex: {
            method: sex.debug.method,
            maleScore: sex.debug.method === "image" ? sex.debug.densities?.male ?? null : sex.debug.male?.hitTokens?.length ?? 0,
            femaleScore: sex.debug.method === "image" ? sex.debug.densities?.female ?? null : sex.debug.female?.hitTokens?.length ?? 0,
            threshold: sex.debug.densities?.threshold ?? null,
            roisUsed:
              sex.debug.method === "image"
                ? sex.debug.imageRois ?? null
                : {
                    male: sex.debug.male?.checkboxRoi ?? null,
                    female: sex.debug.female?.checkboxRoi ?? null,
                  },
            decision: sex.value,
            reasonIfNull: sex.value ? null : sex.debug.reasons.join("; ") || "ambiguous",
            raw: sex.debug,
          },
          gender: {
            male:
              sex.debug.method === "image"
                ? sex.debug.imageRois?.male ?? null
                : sex.debug.male?.checkboxRoi ?? null,
            female:
              sex.debug.method === "image"
                ? sex.debug.imageRois?.female ?? null
                : sex.debug.female?.checkboxRoi ?? null,
            maleScore:
              sex.debug.method === "image"
                ? sex.debug.densities?.male ?? null
                : (sex.debug.male?.hitTokens?.length ?? 0),
            femaleScore:
              sex.debug.method === "image"
                ? sex.debug.densities?.female ?? null
                : (sex.debug.female?.hitTokens?.length ?? 0),
            threshold: sex.debug.densities?.threshold ?? null,
            decided: sex.value,
            raw: sex.debug,
          },
          searchablePdfWarning,
          dob: {
            raw: (dobRow.debug.rawDateMatch ?? rawDobCandidate) || null,
            parsedIso: dobRow.iso ?? dobParsed.iso,
            parseRuleUsed: dobRow.debug.usedRule ?? null,
            reasonsIfNull: dobRow.iso ? [] : dobRow.debug.reasonsIfNull,
            rawDebug: dobRow.debug,
          },
          template: templateAcross,
          preprocess: page1?.page?.preprocessDebug ?? null,
          batch: {
            documentSetId: (extraction as any).document_set_id ? String((extraction as any).document_set_id) : null,
            batchId: (extraction as any).batch_id ? String((extraction as any).batch_id) : null,
            pageCount,
            pagesProcessed: pageViews.length,
            pageIndexesUsed: pdfBuild.pageIndexesUsed,
            pageChosen: { extraction_id: chosenExtractionId, page_index: chosenPageIndex, score: page1.page1Score },
            pages: pageViews.map((r) => ({
              document_id: r.page.document_id,
              page_index: r.page.page_index,
              pageIndexDocAi: r.pageIndex,
              page1Score: r.page1Score,
              template: r.template,
              textLength: r.pageText.length,
            })),
          },
        },
        pages: null,
        paragraphs: null,
        text: pageViews.find((p) => p.pageIndex === 0)?.pageText ?? fullTextAll,
        text_pages: pageViews.map((r) => ({
          document_id: r.page.document_id,
          page_index: r.page.page_index,
          pageIndexDocAi: r.pageIndex,
          textLength: r.pageText.length,
          snippet: r.pageText.slice(0, 300),
        })),
      },
      warnings: ownerLinkWarning ? { owner_link: ownerLinkWarning } : null,
      status: "extracted",
      document_type: docTypeFinal,
      appointment_data: docTypeFinal === "appointment" ? appointmentData : null,
      extraction_debug: {
        ...(docTypeFinal === "appointment" ? { appointment: appointmentDebug } : {}),
        document_detection: {
          type: docTypeFinal,
          detected: docTypeDetected,
          user_selected: userSelectedType,
          confidence: docTypeResult.confidence,
          evidence: docTypeResult.evidence,
          full_text_length: fullTextAll.length,
          is_auto_detect: isAutoDetect,
          mismatch_warning: docTypeMismatchWarning,
          mismatch_details: mismatchDetails,
        },
      },
      doc_type_final: docTypeFinal,
      doc_type_detected: docTypeDetected,
      doc_type_mismatch_warning: docTypeMismatchWarning,
      updated_by: user.id,
    } as any)
    .eq("id", chosenExtractionId);

  // Update employee_documents with doc_type for all documents in this extraction
  try {
    const docSetId = (extraction as any)?.document_set_id;
    const batchId = (extraction as any)?.batch_id;
    
    if (docSetId || batchId) {
      let query = supabase.from("employee_documents").update({
        doc_type: docTypeFinal,
        doc_type_final: docTypeFinal,
        doc_type_detected: docTypeDetected,
        doc_type_mismatch_warning: docTypeMismatchWarning,
        detection_confidence: docTypeResult.confidence,
        detection_evidence: {
          ...docTypeResult.evidence,
          is_auto_detect: isAutoDetect,
          user_selected: userSelectedType,
        },
        document_category: getDocumentCategory(docTypeFinal as DocumentType),
      });
      
      if (docSetId) {
        query = query.eq("document_set_id", docSetId);
      } else if (batchId) {
        query = query.eq("batch_id", batchId);
      }
      
      await query;
    } else {
      // Update single document
      await supabase.from("employee_documents").update({
        doc_type: docTypeFinal,
        doc_type_final: docTypeFinal,
        doc_type_detected: docTypeDetected,
        doc_type_mismatch_warning: docTypeMismatchWarning,
        detection_confidence: docTypeResult.confidence,
        detection_evidence: {
          ...docTypeResult.evidence,
          is_auto_detect: isAutoDetect,
          user_selected: userSelectedType,
        },
        document_category: getDocumentCategory(docTypeFinal as DocumentType),
      }).eq("id", extraction.document_id);
    }
  } catch (e) {
    console.error("Failed to update employee_documents doc_type:", e);
  }

  // Ensure masterlist reflects newly created employees.
  try {
    revalidatePath("/masterlist");
  } catch {
    // ignore
  }

  return NextResponse.json({
    extraction_id: chosenExtractionId,
    batch_id: (extraction as any).batch_id ? String((extraction as any).batch_id) : null,
    page_chosen: { extraction_id: chosenExtractionId, page_index: chosenPageIndex, score: page1.page1Score },
    pageCount,
    pagesProcessed: pageViews.length,
    textLength: (pageViews.find((p) => p.pageIndex === 0)?.pageText ?? fullTextAll).length,
    textPreview: (pageViews.find((p) => p.pageIndex === 0)?.pageText ?? fullTextAll).slice(0, 4000),
    debug: {
      template: templateAcross,
      genderFinal: (ownerCandidate as any)?.gender ?? null,
    },
    ownerEmployeeId,
    ownerLinkWarning,
    documentType: docTypeFinal,
    appointmentData: docTypeFinal === "appointment" ? appointmentData : null,
  });
} catch (err) {
  console.error("/api/ocr failed", err);
  return new NextResponse(err instanceof Error ? err.message : "OCR failed", { status: 500 });
}
}
