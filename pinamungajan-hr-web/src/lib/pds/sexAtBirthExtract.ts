import { getDocumentAiTokens, type DocToken, type TokenBox } from "@/lib/pds/documentAiTokens";
import type { PdsTemplateVersion } from "@/lib/pds/templateDetect";
import { normalizeScanToLegal } from "@/lib/pds/normalizeScanToLegal";

export type NormalizedRect = { x: number; y: number; w: number; h: number };

export type SexAtBirthDebug = {
  method: "docai" | "image" | "none";
  pageIndex: number;
  sexRow?: {
    lineText: string;
    lineBox: NormalizedRect;
  } | null;
  male?: {
    labelBox: NormalizedRect | null;
    checkboxRoi: NormalizedRect | null;
    hitTokens: Array<{ text: string; box: NormalizedRect }>;
  };
  female?: {
    labelBox: NormalizedRect | null;
    checkboxRoi: NormalizedRect | null;
    hitTokens: Array<{ text: string; box: NormalizedRect }>;
  };
  densities?: {
    male: number | null;
    female: number | null;
    threshold: number | null;
  };
  thresholdUsed?: number | null;
  imageRois?: {
    male: NormalizedRect;
    female: NormalizedRect;
  } | null;
  decision: "Male" | "Female" | null;
  reasons: string[];
};

function rectFromBox(b: TokenBox): NormalizedRect {
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

function tokenTextNorm(s: string) {
  return String(s || "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .trim();
}

function unionBox(tokens: DocToken[]): TokenBox | null {
  if (tokens.length === 0) return null;
  const minX = Math.min(...tokens.map((t) => t.box.minX));
  const maxX = Math.max(...tokens.map((t) => t.box.maxX));
  const minY = Math.min(...tokens.map((t) => t.box.minY));
  const maxY = Math.max(...tokens.map((t) => t.box.maxY));
  return { minX, maxX, minY, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
}

function groupTokensIntoLines(tokens: DocToken[]) {
  const sorted = tokens.slice().sort((a, b) => a.box.midY - b.box.midY);
  const lines: DocToken[][] = [];

  for (const t of sorted) {
    const h = Math.max(0.0001, t.box.maxY - t.box.minY);
    const tol = Math.max(0.008, h * 0.8);

    const last = lines[lines.length - 1];
    if (!last) {
      lines.push([t]);
      continue;
    }

    const lastMidY = last.reduce((acc, x) => acc + x.box.midY, 0) / last.length;
    if (Math.abs(t.box.midY - lastMidY) <= tol) last.push(t);
    else lines.push([t]);
  }

  for (const line of lines) line.sort((a, b) => a.box.minX - b.box.minX);
  return lines;
}

function lineTextNorm(line: DocToken[]) {
  return line.map((t) => tokenTextNorm(t.text)).filter(Boolean).join(" ");
}

function tokensInRoi(tokens: DocToken[], roi: NormalizedRect) {
  const x2 = roi.x + roi.w;
  const y2 = roi.y + roi.h;
  return tokens.filter((t) => t.box.midX >= roi.x && t.box.midX <= x2 && t.box.midY >= roi.y && t.box.midY <= y2);
}

function looksLikeCheckMarkToken(t: string) {
  const s = String(t || "").trim();
  if (!s) return false;
  if (/[xX]/.test(s)) return true;
  if (/[✓✔]/.test(s)) return true;
  if (/[■▮▣☒]/.test(s)) return true;
  const n = tokenTextNorm(s);
  return n === "X";
}

function textFromAnchor(fullText: string, anchor: any) {
  const segments = anchor?.textSegments || anchor?.text_segments || [];
  if (!fullText || !Array.isArray(segments) || segments.length === 0) return "";
  return segments
    .map((seg: any) => {
      const start = Number(seg.startIndex ?? seg.start_index ?? 0);
      const end = Number(seg.endIndex ?? seg.end_index ?? 0);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
      return fullText.slice(start, end);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkboxRoiLeftOfLabel(labelBox: TokenBox): NormalizedRect {
  const h = Math.max(0.008, labelBox.maxY - labelBox.minY);
  const size = Math.max(0.012, h * 1.2);
  const pad = Math.max(0.006, h * 0.35);
  const xEnd = Math.max(0, labelBox.minX - pad);
  const xStart = Math.max(0, xEnd - size);
  const yMid = (labelBox.minY + labelBox.maxY) / 2;
  const yStart = Math.max(0, yMid - size / 2);
  const yEnd = Math.min(1, yMid + size / 2);
  return { x: xStart, y: yStart, w: Math.max(0, xEnd - xStart), h: Math.max(0, yEnd - yStart) };
}

const DEFAULT_PERSONAL_INFO_TOP_Y = 0.12;

function findPersonalInfoYRange(lines: DocToken[][]) {
  let personal: TokenBox | null = null;
  let family: TokenBox | null = null;

  for (const line of lines) {
    const txt = lineTextNorm(line);
    if (!txt) continue;
    const b = unionBox(line);
    if (!b) continue;
    if (!personal && txt.includes("PERSONAL") && txt.includes("INFORMATION")) {
      personal = b;
      continue;
    }
  }

  if (personal) {
    for (const line of lines) {
      const txt = lineTextNorm(line);
      if (!txt) continue;
      const b = unionBox(line);
      if (!b) continue;
      if (b.midY <= personal.midY) continue;
      if (txt.includes("FAMILY") && txt.includes("BACKGROUND")) {
        family = b;
        break;
      }
    }
  }

  const start = personal?.minY ?? DEFAULT_PERSONAL_INFO_TOP_Y;
  const end = family?.minY ?? Math.min(1, start + 0.45);
  return { start, end };
}

export async function extractSexAtBirth(
  document: any,
  options: { templateVersion: PdsTemplateVersion; originalMimeType?: string; originalBytes?: Buffer }
): Promise<{ value: "Male" | "Female" | null; debug: SexAtBirthDebug }> {
  const pageIndex = 0;

  const fullText = String(document?.text || "");
  const pagesArr = (document?.pages || []) as any[];
  const firstPage = pagesArr[pageIndex] as any;

  const debug: SexAtBirthDebug = {
    method: "none",
    pageIndex,
    sexRow: null,
    male: { labelBox: null, checkboxRoi: null, hitTokens: [] },
    female: { labelBox: null, checkboxRoi: null, hitTokens: [] },
    decision: null,
    reasons: [],
  };

  // Stage 1: Prefer Document AI structured fields (selection marks / structured fields), if available.
  const formFields = (firstPage?.formFields || firstPage?.form_fields || []) as any[];
  if (Array.isArray(formFields) && formFields.length > 0) {
    for (const ff of formFields) {
      const nameText = textFromAnchor(fullText, ff?.fieldName?.textAnchor || ff?.field_name?.text_anchor || ff?.fieldName?.text_anchor);
      if (!nameText) continue;
      const nameUpper = nameText.toUpperCase();
      if (!(nameUpper.includes("SEX") && nameUpper.includes("BIRTH"))) continue;

      const valueText = textFromAnchor(fullText, ff?.fieldValue?.textAnchor || ff?.field_value?.text_anchor || ff?.fieldValue?.text_anchor);
      const vUpper = String(valueText || "").toUpperCase();
      if (vUpper.includes("MALE") && !vUpper.includes("FEMALE")) {
        debug.method = "docai";
        debug.decision = "Male";
        return { value: "Male", debug };
      }
      if (vUpper.includes("FEMALE") && !vUpper.includes("MALE")) {
        debug.method = "docai";
        debug.decision = "Female";
        return { value: "Female", debug };
      }
    }
    debug.reasons.push("form_fields_present_but_no_sex_value");
  }

  const tokens = getDocumentAiTokens(document).filter((t) => t.pageIndex === pageIndex);
  const lines = groupTokensIntoLines(tokens);
  const yRange = findPersonalInfoYRange(lines);

  const personalLines = lines.filter((ln) => {
    const b = unionBox(ln);
    return b ? b.midY >= yRange.start && b.midY < yRange.end : false;
  });

  // Find the "5. SEX" row (but tolerate missing numbering).
  const sexLine = personalLines
    .map((ln) => ({ ln, txt: lineTextNorm(ln), box: unionBox(ln) }))
    .filter((x) => x.box && x.txt.includes("SEX"))
    .sort((a, b) => {
      const aHas5 = /(^|\s)5($|\s)/.test(a.txt);
      const bHas5 = /(^|\s)5($|\s)/.test(b.txt);
      if (aHas5 !== bHas5) return aHas5 ? -1 : 1;
      return (a.box as TokenBox).midY - (b.box as TokenBox).midY;
    })[0];

  if (!sexLine?.box) {
    debug.reasons.push("sex_row_not_found");
    return { value: null, debug };
  }

  debug.sexRow = { lineText: sexLine.txt, lineBox: rectFromBox(sexLine.box) };

  const maleTok = sexLine.ln.find((t) => tokenTextNorm(t.text) === "MALE") ?? null;
  const femaleTok = sexLine.ln.find((t) => tokenTextNorm(t.text) === "FEMALE") ?? null;

  if (maleTok) {
    const roi = checkboxRoiLeftOfLabel(maleTok.box);
    const hits = tokensInRoi(tokens, roi).filter((t) => looksLikeCheckMarkToken(t.text));
    debug.male = {
      labelBox: rectFromBox(maleTok.box),
      checkboxRoi: roi,
      hitTokens: hits.map((t) => ({ text: String(t.text || "").trim(), box: rectFromBox(t.box) })),
    };
  } else {
    debug.reasons.push("male_label_not_found");
  }

  if (femaleTok) {
    const roi = checkboxRoiLeftOfLabel(femaleTok.box);
    const hits = tokensInRoi(tokens, roi).filter((t) => looksLikeCheckMarkToken(t.text));
    debug.female = {
      labelBox: rectFromBox(femaleTok.box),
      checkboxRoi: roi,
      hitTokens: hits.map((t) => ({ text: String(t.text || "").trim(), box: rectFromBox(t.box) })),
    };
  } else {
    debug.reasons.push("female_label_not_found");
  }

  // Stage 2: Image ROI fallback using ink density. Uses normalized legal output if possible.
  const mime = String(options.originalMimeType || "");
  const bytes = options.originalBytes;
  if (!bytes) {
    debug.reasons.push("image_fallback_missing_bytes");
    return { value: null, debug };
  }

  // Prefer exact checkbox ROIs derived from the detected SEX row tokens.
  // This is more robust than fixed template coordinates when scans are skewed/zoomed.
  const derivedRois =
    debug.male?.checkboxRoi && debug.female?.checkboxRoi
      ? { male: debug.male.checkboxRoi, female: debug.female.checkboxRoi }
      : null;

  const roisByVersion: Record<PdsTemplateVersion, { male: NormalizedRect; female: NormalizedRect }> = {
    // These are conservative approximations for page 1 "5. SEX" checkboxes.
    // If we need to tune later, debug.densities will guide adjustments.
    "2025": {
      male: { x: 0.62, y: 0.255, w: 0.03, h: 0.03 },
      female: { x: 0.74, y: 0.255, w: 0.03, h: 0.03 },
    },
    "2018": {
      male: { x: 0.62, y: 0.255, w: 0.03, h: 0.03 },
      female: { x: 0.74, y: 0.255, w: 0.03, h: 0.03 },
    },
    "unknown": {
      male: { x: 0.62, y: 0.255, w: 0.03, h: 0.03 },
      female: { x: 0.74, y: 0.255, w: 0.03, h: 0.03 },
    },
  };

  const rois = derivedRois ?? roisByVersion[options.templateVersion];
  debug.imageRois = rois;

  async function densityForNormalizedRoi(normalizedPng: Buffer, roi: NormalizedRect) {
    let sharp: any;
    try {
      sharp = (await import("sharp")).default;
    } catch {
      debug.reasons.push("sharp_not_installed");
      return null;
    }

    const img = sharp(normalizedPng);
    const meta = await img.metadata();
    const w = Number(meta.width || 0);
    const h = Number(meta.height || 0);
    if (!w || !h) return null;

    const left = Math.max(0, Math.floor(roi.x * w));
    const top = Math.max(0, Math.floor(roi.y * h));
    const width = Math.max(1, Math.floor(roi.w * w));
    const height = Math.max(1, Math.floor(roi.h * h));

    const raw = await img
      .extract({ left, top, width, height })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const data: Buffer = raw.data;
    if (!data || data.length === 0) return null;

    // Dark pixel ratio. (We can swap to adaptive threshold later if needed.)
    let dark = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < 140) dark++;
    }
    return dark / data.length;
  }

  try {
    const normalized = await normalizeScanToLegal({
      bytes,
      mimeType: mime,
      pageIndex: 0,
      dpi: 300,
      enhance: true,
    });

    const [maleD, femaleD] = await Promise.all([
      densityForNormalizedRoi(normalized.buffer, rois.male),
      densityForNormalizedRoi(normalized.buffer, rois.female),
    ]);

    const threshold = 0.08;
    debug.method = "image";
    debug.densities = { male: maleD, female: femaleD, threshold };
    debug.thresholdUsed = threshold;

    const maleInk = maleD != null && maleD > threshold;
    const femaleInk = femaleD != null && femaleD > threshold;

    if (maleInk && !femaleInk) {
      debug.decision = "Male";
      return { value: "Male", debug };
    }
    if (femaleInk && !maleInk) {
      debug.decision = "Female";
      return { value: "Female", debug };
    }

    debug.reasons.push("image_density_ambiguous_or_blank");
    return { value: null, debug };
  } catch (e) {
    debug.reasons.push(`image_fallback_error:${e instanceof Error ? e.message : String(e)}`);
    return { value: null, debug };
  }
}
