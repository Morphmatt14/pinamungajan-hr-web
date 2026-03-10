import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts, rgb, PDFName } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDS2025_PAGE1_NORM_MAP, type NormBox } from "@/lib/pds2025/pdfFillMap";
import { formatDateDdMmYyyy } from "@/lib/pds/validators";
import { fitTextToWidth, fitWrappedText } from "@/lib/pds/fontFit";
import { READ_ONLY_MODE } from "@/lib/readOnlyMode";

export const runtime = "nodejs";

function cleanText(s: any) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

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

function applyGlobalTransform(box: NormBox, t: { sx: number; sy: number; dx: number; dy: number }): NormBox {
  return {
    x: box.x * t.sx + t.dx,
    y: box.y * t.sy + t.dy,
    w: box.w * t.sx,
    h: box.h * t.sy,
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeBox(b: NormBox): NormBox {
  return {
    x: clamp01(b.x),
    y: clamp01(b.y),
    w: Math.max(0, clamp01(b.x + b.w) - clamp01(b.x)),
    h: Math.max(0, clamp01(b.y + b.h) - clamp01(b.y)),
  };
}

type ActiveMap = {
  transform: { sx: number; sy: number; dx: number; dy: number };
  fields: typeof PDS2025_PAGE1_NORM_MAP;
  styles?: Partial<Record<string, FieldStyle>>;
};

function isLegacyFieldsShape(fields: any): fields is typeof PDS2025_PAGE1_NORM_MAP {
  return Boolean(
    fields &&
      typeof fields === "object" &&
      fields.surname &&
      fields.first_name &&
      fields.middle_name &&
      fields.name_extension &&
      fields.date_of_birth &&
      fields.place_of_birth &&
      fields.citizenship &&
      fields.sex &&
      fields.sex.male &&
      fields.sex.female
  );
}

function legacyFieldsFromV2Fields(fields: any): typeof PDS2025_PAGE1_NORM_MAP | null {
  if (!Array.isArray(fields)) return null;

  function pick(id: string): NormBox | null {
    const f = fields.find((x: any) => x && typeof x === "object" && x.id === id);
    const b = f?.box;
    if (!b || typeof b !== "object") return null;
    const x = Number(b.x);
    const y = Number(b.y);
    const w = Number(b.w);
    const h = Number(b.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
    return { x, y, w, h };
  }

  const surname = pick("surname");
  const first_name = pick("first_name");
  const middle_name = pick("middle_name");
  const name_extension = pick("name_extension");
  const date_of_birth = pick("date_of_birth");
  const place_of_birth = pick("place_of_birth");
  const citizenship = pick("citizenship");
  const sex_male = pick("sex.male") ?? pick("sex_male");
  const sex_female = pick("sex.female") ?? pick("sex_female");

  if (!surname || !first_name || !middle_name || !name_extension || !date_of_birth || !place_of_birth || !citizenship || !sex_male || !sex_female) {
    return null;
  }

  return {
    surname,
    first_name,
    middle_name,
    name_extension,
    date_of_birth,
    place_of_birth,
    citizenship,
    sex: { male: sex_male, female: sex_female },
  };
}

type FieldStyle = {
  paddingPx: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "middle" | "bottom";
  maxFontSize: number;
  minFontSize: number;
  singleLine: boolean;
};

const DEFAULT_STYLE: FieldStyle = {
  paddingPx: 2,
  alignX: "left",
  alignY: "middle",
  maxFontSize: 11,
  minFontSize: 6,
  singleLine: true,
};

function styleForField(active: ActiveMap, fieldId: string): FieldStyle {
  const s = (active.styles?.[fieldId] ?? {}) as Partial<FieldStyle>;
  return {
    paddingPx: Number.isFinite(s.paddingPx) ? Number(s.paddingPx) : DEFAULT_STYLE.paddingPx,
    alignX: s.alignX === "center" || s.alignX === "right" ? s.alignX : DEFAULT_STYLE.alignX,
    alignY: s.alignY === "top" || s.alignY === "bottom" ? s.alignY : DEFAULT_STYLE.alignY,
    maxFontSize: Number.isFinite(s.maxFontSize) ? Number(s.maxFontSize) : DEFAULT_STYLE.maxFontSize,
    minFontSize: Number.isFinite(s.minFontSize) ? Number(s.minFontSize) : DEFAULT_STYLE.minFontSize,
    singleLine: typeof s.singleLine === "boolean" ? s.singleLine : DEFAULT_STYLE.singleLine,
  };
}

function fontMeasurer(font: any) {
  return {
    widthOfTextAtSize: (text: string, size: number) => font.widthOfTextAtSize(text, size),
  };
}

function safeFilenamePart(s: string) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^0-9A-Za-z\- ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .toUpperCase();
}

function normBoxToPdfRect(box: NormBox, pageW: number, pageH: number, cropBox: number[] | null) {
  // The mapping editor's template PNG is rendered by pdf.js, which uses the visible CropBox.
  // pdf-lib drawing uses the page's user space (MediaBox). If CropBox is present, we must
  // convert normalized boxes against the CropBox width/height and then offset by CropBox origin.
  const cropX = cropBox ? Number(cropBox[0] ?? 0) : 0;
  const cropY = cropBox ? Number(cropBox[1] ?? 0) : 0;
  const cropW = cropBox ? Number(cropBox[2] ?? pageW) - cropX : pageW;
  const cropH = cropBox ? Number(cropBox[3] ?? pageH) - cropY : pageH;

  const baseW = Number.isFinite(cropW) && cropW > 0 ? cropW : pageW;
  const baseH = Number.isFinite(cropH) && cropH > 0 ? cropH : pageH;

  const x = cropX + box.x * baseW;
  const w = box.w * baseW;
  const h = box.h * baseH;
  const yTop = box.y * baseH;
  // pdf-lib is bottom-left; map is top-left.
  const y = cropY + baseH - yTop - h;
  return { x, y, w, h };
}

function rotatePoint(
  pt: { x: number; y: number },
  refW: number,
  refH: number,
  rotationDeg: number
): { x: number; y: number } {
  const r = ((rotationDeg % 360) + 360) % 360;
  if (r === 0) return pt;
  // Map a point from "visual" unrotated space into the rotated page's user space
  // so that it appears at the intended visual position.
  if (r === 90) return { x: pt.y, y: refW - pt.x };
  if (r === 180) return { x: refW - pt.x, y: refH - pt.y };
  if (r === 270) return { x: refH - pt.y, y: pt.x };
  return pt;
}

function normBoxToPdfRectWithRotation(
  box: NormBox,
  pageW: number,
  pageH: number,
  rotationDeg: number,
  cropBox: number[] | null
) {
  // Apply rotation in crop-local coordinates (matching pdf.js viewport behavior),
  // then translate into the PDF's user space via CropBox origin.
  const cropX = cropBox ? Number(cropBox[0] ?? 0) : 0;
  const cropY = cropBox ? Number(cropBox[1] ?? 0) : 0;
  const cropW = cropBox ? Number(cropBox[2] ?? pageW) - cropX : pageW;
  const cropH = cropBox ? Number(cropBox[3] ?? pageH) - cropY : pageH;
  const baseW = Number.isFinite(cropW) && cropW > 0 ? cropW : pageW;
  const baseH = Number.isFinite(cropH) && cropH > 0 ? cropH : pageH;

  // crop-local rect (origin at crop bottom-left)
  const rLocal = normBoxToPdfRect(box, baseW, baseH, null);
  const p1l = rotatePoint({ x: rLocal.x, y: rLocal.y }, baseW, baseH, rotationDeg);
  const p2l = rotatePoint({ x: rLocal.x + rLocal.w, y: rLocal.y }, baseW, baseH, rotationDeg);
  const p3l = rotatePoint({ x: rLocal.x, y: rLocal.y + rLocal.h }, baseW, baseH, rotationDeg);
  const p4l = rotatePoint({ x: rLocal.x + rLocal.w, y: rLocal.y + rLocal.h }, baseW, baseH, rotationDeg);

  // translate to media/user space
  const p1 = { x: p1l.x + cropX, y: p1l.y + cropY };
  const p2 = { x: p2l.x + cropX, y: p2l.y + cropY };
  const p3 = { x: p3l.x + cropX, y: p3l.y + cropY };
  const p4 = { x: p4l.x + cropX, y: p4l.y + cropY };
  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

function rectFromViewport(
  box: NormBox,
  viewport: any
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  // Mapping editor template PNG is rendered via pdf.js `getViewport()`.
  // Convert normalized (0..1) coords in that viewport back to PDF user space.
  const vw = Number(viewport?.width ?? 0);
  const vh = Number(viewport?.height ?? 0);
  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) {
    throw new Error("Invalid pdf.js viewport size");
  }
  if (typeof viewport.convertToPdfPoint !== "function") {
    throw new Error("pdf.js viewport.convertToPdfPoint missing");
  }

  const x0 = box.x * vw;
  const y0 = box.y * vh;
  const x1 = (box.x + box.w) * vw;
  const y1 = (box.y + box.h) * vh;

  const p1 = viewport.convertToPdfPoint(x0, y0);
  const p2 = viewport.convertToPdfPoint(x1, y0);
  const p3 = viewport.convertToPdfPoint(x0, y1);
  const p4 = viewport.convertToPdfPoint(x1, y1);

  const xs = [p1[0], p2[0], p3[0], p4[0]].map((n: any) => Number(n));
  const ys = [p1[1], p2[1], p3[1], p4[1]].map((n: any) => Number(n));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

export async function POST(request: Request) {
  try {
    if (READ_ONLY_MODE) {
      return new NextResponse("Not found", { status: 404 });
    }

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
      .select("id, raw_extracted_json")
      .eq("id", extractionId)
      .single();

    if (exErr || !extraction) {
      return new NextResponse(exErr?.message || "Extraction not found", { status: 404 });
    }

    const owner = (extraction as any).raw_extracted_json?.owner_candidate || {};

    // Load DB map first (admin-calibrated), fallback to TS map.
    let activeMap: ActiveMap = {
      transform: { sx: 1, sy: 1, dx: 0, dy: 0 },
      fields: PDS2025_PAGE1_NORM_MAP,
      styles: {},
    };

    try {
      const { data: rows } = await supabase
        .from("pds_template_maps")
        .select("map_json")
        .eq("template_version", "2025")
        .eq("page", 1)
        .order("updated_at", { ascending: false })
        .limit(1);

      const mj = (rows || [])[0]?.map_json as any;
      if (mj?.fields) {
        const legacy = isLegacyFieldsShape(mj.fields)
          ? (mj.fields as any)
          : legacyFieldsFromV2Fields(mj.fields);
        if (legacy) {
          activeMap = {
            transform: {
              sx: Number(mj?.transform?.sx ?? 1),
              sy: Number(mj?.transform?.sy ?? 1),
              dx: Number(mj?.transform?.dx ?? 0),
              dy: Number(mj?.transform?.dy ?? 0),
            },
            fields: legacy,
            styles: mj.styles || {},
          } as any;
        }
      }
    } catch {
      // ignore map load failures; fallback remains
    }

    const T = activeMap.transform;
    const F = activeMap.fields;

  const Ftx = {
    surname: sanitizeBox(applyGlobalTransform(F.surname, T)),
    first_name: sanitizeBox(applyGlobalTransform(F.first_name, T)),
    middle_name: sanitizeBox(applyGlobalTransform(F.middle_name, T)),
    name_extension: sanitizeBox(applyGlobalTransform(F.name_extension, T)),
    date_of_birth: sanitizeBox(applyGlobalTransform(F.date_of_birth, T)),
    place_of_birth: sanitizeBox(applyGlobalTransform(F.place_of_birth, T)),
    citizenship: sanitizeBox(applyGlobalTransform(F.citizenship, T)),
    sex: {
      male: sanitizeBox(applyGlobalTransform(F.sex.male, T)),
      female: sanitizeBox(applyGlobalTransform(F.sex.female, T)),
    },
  };

    const templatePath = path.join(
      process.cwd(),
      "public",
      "guides",
      "CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf"
    );

    const templateBytes = await readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page1 = pdfDoc.getPage(0);
    const debugMode = new URL(request.url).searchParams.get("debug") === "1";
    const debugGrid = new URL(request.url).searchParams.get("grid") === "1";
    const { width: pageW, height: pageH } = page1.getSize();
    const rotation = (page1.getRotation?.().angle ?? 0) as number;

    // Use pdf.js viewport conversion if available (matches template PNG rendering).
    // Falls back to pdf-lib math if pdf.js isn't available in the environment.
    let viewport: any = null;
    try {
      const pdfjs = await importPdfjs();
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(templateBytes), disableWorker: true });
      const pdf = await loadingTask.promise;
      const p = await pdf.getPage(1);
      viewport = p.getViewport({ scale: 1 });
    } catch {
      viewport = null;
    }

  // CropBox / MediaBox diagnostics (pdf-lib doesn't officially expose, so we peek at the low-level node)
  let cropBox: number[] | null = null;
  try {
    const maybe = (page1 as any).node?.get?.(PDFName.of("CropBox"));
    const arr = maybe?.asArray?.() ?? maybe;
    if (arr && typeof arr.size === "function" && arr.size() === 4) {
      cropBox = [0, 1, 2, 3].map((i) => Number(arr.get(i)?.asNumber?.() ?? arr.get(i))) as number[];
    }
  } catch {
    cropBox = null;
  }

  const aspect = pageW > 0 ? pageH / pageW : null;
  const warnings: string[] = [];
  if (aspect && (aspect < 1.2 || aspect > 1.6)) warnings.push(`unusual_aspect_ratio:${aspect.toFixed(3)}`);
  if (cropBox) warnings.push(`cropbox_present:[${cropBox.map((n) => n.toFixed(2)).join(",")}]`);

  function drawBox(name: string, box: NormBox) {
    const r = viewport ? rectFromViewport(box, viewport) : normBoxToPdfRectWithRotation(box, pageW, pageH, rotation, cropBox);
    page1.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      borderColor: rgb(1, 0, 0),
      borderWidth: 0.8,
      opacity: 0.9,
    });
    // label
    page1.drawText(name, { x: r.x + 1.5, y: r.y + r.h + 1.5, size: 7, font, color: rgb(1, 0, 0) });

    // center crosshair
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    page1.drawLine({ start: { x: cx - 6, y: cy }, end: { x: cx + 6, y: cy }, thickness: 0.7, color: rgb(1, 0, 0) });
    page1.drawLine({ start: { x: cx, y: cy - 6 }, end: { x: cx, y: cy + 6 }, thickness: 0.7, color: rgb(1, 0, 0) });
  }

  function drawTextInBox(text: string, box: NormBox, fieldId: string) {
    const r = viewport ? rectFromViewport(box, viewport) : normBoxToPdfRectWithRotation(box, pageW, pageH, rotation, cropBox);
    const st = styleForField(activeMap, fieldId);
    const pad = Math.max(0, Number(st.paddingPx) || 0);
    const maxW = Math.max(1, r.w - pad * 2);
    const maxH = Math.max(1, r.h - pad * 2);
    const maxSize = Math.min(st.maxFontSize, r.h * 0.95);
    const minSize = Math.max(1, st.minFontSize);

    if (st.singleLine) {
      const fitted = fitTextToWidth(fontMeasurer(font), text, maxW, maxSize, minSize);
      if (!fitted.text) return;

      let x = r.x + pad;
      if (st.alignX === "center") x = r.x + r.w / 2 - font.widthOfTextAtSize(fitted.text, fitted.size) / 2;
      if (st.alignX === "right") x = r.x + r.w - pad - font.widthOfTextAtSize(fitted.text, fitted.size);

      let y = r.y + pad;
      if (st.alignY === "middle") y = r.y + (r.h - fitted.size) / 2;
      if (st.alignY === "bottom") y = r.y + r.h - pad - fitted.size;

      page1.drawText(fitted.text, { x, y, size: fitted.size, font, color: rgb(0, 0, 0) });
      return;
    }

    const wrapped = fitWrappedText(fontMeasurer(font), text, maxW, maxH, maxSize, minSize);
    const blockH = wrapped.lines.length * wrapped.lineH;
    let startY = r.y + pad;
    if (st.alignY === "middle") startY = r.y + (r.h - blockH) / 2;
    if (st.alignY === "bottom") startY = r.y + r.h - pad - blockH;

    wrapped.lines.forEach((ln, i) => {
      const w = font.widthOfTextAtSize(ln, wrapped.size);
      let x = r.x + pad;
      if (st.alignX === "center") x = r.x + r.w / 2 - w / 2;
      if (st.alignX === "right") x = r.x + r.w - pad - w;
      const y = startY + (wrapped.lines.length - 1 - i) * wrapped.lineH;
      page1.drawText(ln, { x, y, size: wrapped.size, font, color: rgb(0, 0, 0) });
    });
  }

  function drawXInBox(box: NormBox) {
    const r = viewport ? rectFromViewport(box, viewport) : normBoxToPdfRectWithRotation(box, pageW, pageH, rotation, cropBox);
    const size = Math.max(8, Math.min(12, r.h * 0.9));
    const x = r.x + r.w / 2 - size * 0.25;
    const y = r.y + r.h / 2 - size * 0.35;
    page1.drawText("X", { x, y, size, font, color: rgb(0, 0, 0) });
  }

  const surname = cleanText(owner.last_name);
  const first = cleanText(owner.first_name);
  const middle = cleanText(owner.middle_name);
  const ext = cleanText(owner.name_extension);
  const dob = owner.date_of_birth ? formatDateDdMmYyyy(String(owner.date_of_birth)) : "";

  if (debugMode) {
    // Unmissable diagnostics block
    const diagLines = [
      `PDS generate-pdf debug=1`,
      `pageIndex=0`,
      `pageW=${pageW.toFixed(2)} pageH=${pageH.toFixed(2)} aspect=${aspect ? aspect.toFixed(3) : "null"}`,
      `rotation=${rotation}`,
      `cropBox=${cropBox ? `[${cropBox.map((n) => n.toFixed(2)).join(",")}]` : "null"}`,
      warnings.length > 0 ? `warnings=${warnings.join(";")}` : `warnings=none`,
      `globalTransform: sx=${T.sx} sy=${T.sy} dx=${T.dx} dy=${T.dy}`,
      `originFlip: x=xNorm*W, y=H-(yNorm*H)-(hNorm*H)`,
    ];
    const diagX = 12;
    let diagY = pageH - 18;
    for (const ln of diagLines) {
      page1.drawText(ln, { x: diagX, y: diagY, size: 8, font, color: rgb(0.6, 0, 0) });
      diagY -= 10;
    }

    if (debugGrid) {
      // faint grid overlay in 0.1 increments
      for (let i = 1; i < 10; i++) {
        const gx = (i / 10) * pageW;
        page1.drawLine({
          start: { x: gx, y: 0 },
          end: { x: gx, y: pageH },
          thickness: 0.4,
          color: rgb(0.9, 0.2, 0.2),
          opacity: 0.25,
        });
        const gy = (i / 10) * pageH;
        page1.drawLine({
          start: { x: 0, y: gy },
          end: { x: pageW, y: gy },
          thickness: 0.4,
          color: rgb(0.9, 0.2, 0.2),
          opacity: 0.25,
        });
      }
    }

    drawBox("surname", Ftx.surname);
    drawBox("first_name", Ftx.first_name);
    drawBox("middle_name", Ftx.middle_name);
    drawBox("name_extension", Ftx.name_extension);
    drawBox("date_of_birth", Ftx.date_of_birth);
    drawBox("place_of_birth", Ftx.place_of_birth);
    drawBox("citizenship", Ftx.citizenship);
    drawBox("sex_male", Ftx.sex.male);
    drawBox("sex_female", Ftx.sex.female);
  }

  if (surname) drawTextInBox(surname, Ftx.surname, "surname");
  if (first) drawTextInBox(first, Ftx.first_name, "first_name");
  if (middle) drawTextInBox(middle, Ftx.middle_name, "middle_name");
  if (ext) drawTextInBox(ext, Ftx.name_extension, "name_extension");
  if (dob) drawTextInBox(dob, Ftx.date_of_birth, "date_of_birth");

  const placeOfBirth = cleanText(owner.place_of_birth);
  if (placeOfBirth) {
    drawTextInBox(placeOfBirth, Ftx.place_of_birth, "place_of_birth");
  }

  const citizenship = cleanText(owner.citizenship);
  if (citizenship) {
    drawTextInBox(citizenship, Ftx.citizenship, "citizenship");
  }

  const gender = String(owner.gender || "");
  if (gender === "Male") {
    drawXInBox(Ftx.sex.male);
  }
  if (gender === "Female") {
    drawXInBox(Ftx.sex.female);
  }

    const out = await pdfDoc.save();
    const buf = Buffer.from(out);

    const filename = `PDS-2025-${safeFilenamePart(surname) || "UNKNOWN"}-${safeFilenamePart(first) || "UNKNOWN"}-${extractionId}.pdf`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Failed to generate PDF: ${msg}`, { status: 500 });
  }
}
