import { getDocumentAiTokens, type DocToken, type TokenBox } from "@/lib/pds/documentAiTokens";
import { validateDobToIso, validatePersonName } from "@/lib/pds/validators";
import type { PdsTemplateVersion } from "@/lib/pds/templateDetect";

export type NormalizedRect = { x: number; y: number; w: number; h: number };

export type AnchorFieldDebug = {
  labelQuery: string;
  labelFound: boolean;
  allCandidates?: Array<{
    score: number;
    reasons: string[];
    box: NormalizedRect;
    lineBox: NormalizedRect;
    lineText: string;
  }>;
  chosenCandidate?: {
    score: number;
    reasons: string[];
    box: NormalizedRect;
    lineBox: NormalizedRect;
    lineText: string;
  } | null;
  labelBox: NormalizedRect | null;
  valueRoi: NormalizedRect | null;
  selectedTokens: Array<{ text: string; box: NormalizedRect }>;
  extractedRaw: string;
  parsedIso?: string | null;
  validation: { ok: boolean; reasons: string[] };
};

export type AnchorOwnerDebug = {
  used: "anchor";
  pageIndex: number;
  personalInfoHeader: NormalizedRect | null;
  familyHeader: NormalizedRect | null;
  personalInfoRangeY: { start: number | null; end: number | null };
  fields: {
    surname: AnchorFieldDebug;
    first_name: AnchorFieldDebug;
    middle_name: AnchorFieldDebug;
    date_of_birth: AnchorFieldDebug;
  };
};

export type OwnerCandidate = {
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  date_of_birth: string | null;
  confidence: number;
};

export type AnchorExtractOptions = {
  templateVersion: PdsTemplateVersion;
};

function rectFromBox(b: TokenBox): NormalizedRect {
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

function unionBox(tokens: DocToken[]): TokenBox | null {
  if (tokens.length === 0) return null;
  const minX = Math.min(...tokens.map((t) => t.box.minX));
  const maxX = Math.max(...tokens.map((t) => t.box.maxX));
  const minY = Math.min(...tokens.map((t) => t.box.minY));
  const maxY = Math.max(...tokens.map((t) => t.box.maxY));
  return { minX, maxX, minY, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
}

function tokenTextNorm(s: string) {
  return String(s || "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .trim();
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
    if (Math.abs(t.box.midY - lastMidY) <= tol) {
      last.push(t);
    } else {
      lines.push([t]);
    }
  }

  // sort each line left-to-right
  for (const line of lines) line.sort((a, b) => a.box.minX - b.box.minX);
  return lines;
}

function lineTextNorm(line: DocToken[]) {
  return line.map((t) => tokenTextNorm(t.text)).filter(Boolean).join(" ");
}

const DEFAULT_PERSONAL_INFO_TOP_Y = 0.12;
const LABEL_COL_X_MIN = 0.02;
const LABEL_COL_X_MAX = 0.28;

type LabelCandidate = {
  score: number;
  reasons: string[];
  labelBox: TokenBox;
  lineBox: TokenBox;
  lineText: string;
};

function yOverlapRatio(a: TokenBox, b: TokenBox) {
  const top = Math.max(a.minY, b.minY);
  const bot = Math.min(a.maxY, b.maxY);
  const inter = Math.max(0, bot - top);
  const ha = Math.max(1e-6, a.maxY - a.minY);
  const hb = Math.max(1e-6, b.maxY - b.minY);
  return inter / Math.min(ha, hb);
}

function lineIncludesAll(lineText: string, parts: string[]) {
  const u = lineText.toUpperCase();
  return parts.every((p) => u.includes(p));
}

function findSectionHeaders(lines: DocToken[][]): {
  personalInfo: { box: TokenBox; lineText: string } | null;
  family: { box: TokenBox; lineText: string } | null;
} {
  let personal: { box: TokenBox; lineText: string } | null = null;
  let family: { box: TokenBox; lineText: string } | null = null;

  for (const line of lines) {
    const txt = lineTextNorm(line);
    if (!txt) continue;
    const lineBox = unionBox(line);
    if (!lineBox) continue;

    if (!personal && lineIncludesAll(txt, ["PERSONAL", "INFORMATION"])) {
      personal = { box: lineBox, lineText: txt };
      continue;
    }
  }

  if (personal) {
    for (const line of lines) {
      const txt = lineTextNorm(line);
      if (!txt) continue;
      const lineBox = unionBox(line);
      if (!lineBox) continue;
      if (lineBox.midY <= personal.box.midY) continue;
      if (lineIncludesAll(txt, ["FAMILY", "BACKGROUND"])) {
        family = { box: lineBox, lineText: txt };
        break;
      }
    }
  }

  return { personalInfo: personal, family };
}

function findLabelCandidates(
  lines: DocToken[][],
  label: "SURNAME" | "FIRST NAME" | "MIDDLE NAME" | "DATE OF BIRTH",
  yRange: { start: number; end: number }
) {
  const out: LabelCandidate[] = [];

  const matchLine = (txt: string) => {
    const u = txt.toUpperCase();
    if (label === "SURNAME") {
      if (u.includes("SURNAME")) return true;
      if (u.includes("SUR") && u.includes("NAME")) return true;
      return false;
    }
    if (label === "FIRST NAME") {
      if (u.includes("FIRST NAME") || u.includes("FIRSTNAME")) return true;
      return false;
    }
    if (label === "MIDDLE NAME") {
      if (u.includes("MIDDLE NAME") || u.includes("MIDDLENAME")) return true;
      return false;
    }
    if (label === "DATE OF BIRTH") {
      if (u.includes("DATE OF BIRTH") || u.includes("DOB")) return true;
      return false;
    }
    return false;
  };

  for (const line of lines) {
    const txt = lineTextNorm(line);
    if (!txt) continue;
    if (!matchLine(txt)) continue;

    const lineBox = unionBox(line);
    if (!lineBox) continue;

    // Hard section constraint: ignore outside personal info y-range.
    if (!(lineBox.midY >= yRange.start && lineBox.midY < yRange.end)) continue;

    // Determine the label tokens subset used for bbox.
    const norms = line.map((t) => tokenTextNorm(t.text));
    let labelTokens: DocToken[] = [];
    if (label === "SURNAME") {
      const idx = norms.findIndex((n) => n === "SURNAME");
      if (idx >= 0) labelTokens = [line[idx]];
      else {
        const sur = norms.findIndex((n) => n === "SUR");
        const name = norms.findIndex((n) => n === "NAME");
        if (sur >= 0 && name >= 0) labelTokens = [line[Math.min(sur, name)], line[Math.max(sur, name)]];
      }
    } else if (label === "FIRST NAME") {
      const first = norms.findIndex((n) => n === "FIRST");
      const name = norms.findIndex((n) => n === "NAME");
      if (first >= 0 && name >= 0) labelTokens = [line[Math.min(first, name)], line[Math.max(first, name)]];
      else {
        const idx = norms.findIndex((n) => n === "FIRSTNAME");
        if (idx >= 0) labelTokens = [line[idx]];
      }
    } else if (label === "MIDDLE NAME") {
      const mid = norms.findIndex((n) => n === "MIDDLE");
      const name = norms.findIndex((n) => n === "NAME");
      if (mid >= 0 && name >= 0) labelTokens = [line[Math.min(mid, name)], line[Math.max(mid, name)]];
      else {
        const idx = norms.findIndex((n) => n === "MIDDLENAME");
        if (idx >= 0) labelTokens = [line[idx]];
      }
    } else {
      // DATE OF BIRTH
      const date = norms.findIndex((n) => n === "DATE");
      const of = norms.findIndex((n) => n === "OF");
      const birth = norms.findIndex((n) => n === "BIRTH");
      if (date >= 0 && birth >= 0) {
        const start = Math.min(date, of >= 0 ? of : date, birth);
        const end = Math.max(date, of >= 0 ? of : date, birth);
        labelTokens = line.slice(start, end + 1);
      } else {
        const idx = norms.findIndex((n) => n === "DOB");
        if (idx >= 0) labelTokens = [line[idx]];
      }
    }

    const labelBox = unionBox(labelTokens.length ? labelTokens : line);
    if (!labelBox) continue;

    const reasons: string[] = [];
    let score = 0;

    // Prefer candidates near the top of Personal Information (owner is always the first block).
    const relY = Math.max(0, lineBox.midY - yRange.start);
    score += Math.max(0, 30 - relY * 300);
    reasons.push("topmost_preference");

    // Left-column constraint.
    if (labelBox.minX >= LABEL_COL_X_MIN && labelBox.maxX <= LABEL_COL_X_MAX) {
      score += 50;
      reasons.push("left_column_ok");
    } else {
      score -= 40;
      reasons.push("left_column_penalty");
    }

    // Instruction paragraph penalty: very small token height.
    const h = labelBox.maxY - labelBox.minY;
    if (h >= 0.012) {
      score += 15;
      reasons.push("label_height_ok");
    } else {
      score -= 25;
      reasons.push("tiny_text_penalty");
    }

    // Prefer being not too close to page top.
    if (labelBox.midY >= 0.16) score += 10;

    out.push({ score, reasons, labelBox, lineBox, lineText: txt });
  }

  return out;
}

function buildValueRoiFromColumns(labelColRight: number, lineBox: TokenBox, valueWidth: number) {
  const padX = 0.012;
  const xStart = Math.min(0.98, labelColRight + padX);
  const xEnd = Math.min(0.98, xStart + valueWidth);

  // Tight row band: no drift to other rows.
  const rowH = Math.max(0.01, lineBox.maxY - lineBox.minY);
  const yStart = Math.max(0, lineBox.minY - rowH * 0.15);
  const yEnd = Math.min(1, lineBox.maxY + rowH * 0.15);
  return { x: xStart, y: yStart, w: Math.max(0, xEnd - xStart), h: Math.max(0, yEnd - yStart) };
}

function tokensInRowAndRoi(tokens: DocToken[], roi: NormalizedRect, rowBox: TokenBox) {
  const x2 = roi.x + roi.w;
  const y2 = roi.y + roi.h;
  return tokens.filter((t) => {
    const inRoi = t.box.midX >= roi.x && t.box.midX <= x2 && t.box.midY >= roi.y && t.box.midY <= y2;
    if (!inRoi) return false;
    return yOverlapRatio(t.box, rowBox) >= 0.6;
  });
}

function joinTokensSmart(tokens: DocToken[]) {
  const sorted = tokens.slice().sort((a, b) => a.box.minX - b.box.minX);
  let out = "";
  for (let i = 0; i < sorted.length; i++) {
    const t = String(sorted[i].text || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (!out) {
      out = t;
      continue;
    }

    const prev = sorted[i - 1];
    const gap = sorted[i].box.minX - prev.box.maxX;
    // If tiny gap (common for split OCR like OMAN + DAC), concatenate.
    if (gap >= 0 && gap <= 0.008) {
      out = `${out}${t}`;
    } else {
      out = `${out} ${t}`;
    }
  }

  return out.replace(/\s+/g, " ").trim();
}

function makeEmptyFieldDebug(labelQuery: string): AnchorFieldDebug {
  return {
    labelQuery,
    labelFound: false,
    allCandidates: [],
    chosenCandidate: null,
    labelBox: null,
    valueRoi: null,
    selectedTokens: [],
    extractedRaw: "",
    validation: { ok: false, reasons: ["label_not_found"] },
  };
}

function pickBestLabelSet(
  surname: LabelCandidate[],
  first: LabelCandidate[],
  middle: LabelCandidate[],
  templateVersion: PdsTemplateVersion
): { surname: LabelCandidate | null; first: LabelCandidate | null; middle: LabelCandidate | null } {
  let best: { s: LabelCandidate; f: LabelCandidate; m: LabelCandidate; score: number } | null = null;
  for (const s of surname) {
    for (const f of first) {
      for (const m of middle) {
        let score = s.score + f.score + m.score;

        // Numbering preference on the SURNAME row.
        if (templateVersion === "2018") {
          if (/(^|\s)2($|\s)/.test(s.lineText)) score += 25;
          if (/(^|\s)1($|\s)/.test(s.lineText)) score -= 10;
        } else if (templateVersion === "2025") {
          if (/(^|\s)1($|\s)/.test(s.lineText)) score += 25;
          if (/(^|\s)2($|\s)/.test(s.lineText)) score -= 10;
        }

        // Vertical order and spacing.
        if (f.labelBox.midY > s.labelBox.midY) score += 20;
        else score -= 60;
        if (m.labelBox.midY > f.labelBox.midY) score += 20;
        else score -= 60;

        const dy1 = f.labelBox.midY - s.labelBox.midY;
        const dy2 = m.labelBox.midY - f.labelBox.midY;
        if (dy1 >= 0.015 && dy1 <= 0.08) score += 10;
        if (dy2 >= 0.015 && dy2 <= 0.08) score += 10;

        // Left column x alignment.
        const dxSF = Math.abs(f.labelBox.minX - s.labelBox.minX);
        const dxFM = Math.abs(m.labelBox.minX - f.labelBox.minX);
        if (dxSF <= 0.03) score += 15;
        else score -= 15;
        if (dxFM <= 0.03) score += 15;
        else score -= 15;

        if (!best || score > best.score) best = { s, f, m, score };
      }
    }
  }

  if (!best) return { surname: null, first: null, middle: null };
  return { surname: best.s, first: best.f, middle: best.m };
}

function extractValueForRow(pageTokens: DocToken[], rowBox: TokenBox, labelColRight: number, valueWidth: number) {
  const roi = buildValueRoiFromColumns(labelColRight, rowBox, valueWidth);
  const selected = tokensInRowAndRoi(pageTokens, roi, rowBox);
  const raw = joinTokensSmart(selected);
  return { roi, selected, raw };
}

export function extractOwnerByAnchors(
  document: any,
  options: AnchorExtractOptions
): { owner: OwnerCandidate | null; debug: AnchorOwnerDebug } {
  const tokens = getDocumentAiTokens(document);
  const pageIndex = 0;
  const pageTokens = tokens.filter((t) => t.pageIndex === pageIndex);
  const lines = groupTokensIntoLines(pageTokens);

  const version: PdsTemplateVersion = options?.templateVersion ?? "unknown";

  const headers = findSectionHeaders(lines);
  const personalStart = headers.personalInfo?.box.minY ?? DEFAULT_PERSONAL_INFO_TOP_Y;
  const personalEnd = headers.family?.box.minY ?? Math.min(1, personalStart + 0.45);
  const yRange = { start: personalStart, end: personalEnd };

  const inPersonalInfo = (t: DocToken) => t.box.midY >= yRange.start && t.box.midY < yRange.end;
  const personalLines = lines.filter((ln) => {
    const b = unionBox(ln);
    if (!b) return false;
    return b.midY >= yRange.start && b.midY < yRange.end;
  });

  const surnameCandidates = findLabelCandidates(personalLines, "SURNAME", yRange);
  const firstCandidates = findLabelCandidates(personalLines, "FIRST NAME", yRange);
  const middleCandidates = findLabelCandidates(personalLines, "MIDDLE NAME", yRange);
  const dobCandidates = findLabelCandidates(personalLines, "DATE OF BIRTH", yRange);

  const chosenSet = pickBestLabelSet(surnameCandidates, firstCandidates, middleCandidates, version);

  const labelColRight = Math.max(
    chosenSet.surname?.labelBox.maxX ?? 0,
    chosenSet.first?.labelBox.maxX ?? 0,
    chosenSet.middle?.labelBox.maxX ?? 0
  );

  const valueWidth = 0.38;

  const surnameField = makeEmptyFieldDebug("SURNAME");
  surnameField.allCandidates = surnameCandidates.map((c) => ({
    score: c.score,
    reasons: c.reasons,
    box: rectFromBox(c.labelBox),
    lineBox: rectFromBox(c.lineBox),
    lineText: c.lineText,
  }));
  const firstField = makeEmptyFieldDebug("FIRST NAME");
  firstField.allCandidates = firstCandidates.map((c) => ({
    score: c.score,
    reasons: c.reasons,
    box: rectFromBox(c.labelBox),
    lineBox: rectFromBox(c.lineBox),
    lineText: c.lineText,
  }));
  const middleField = makeEmptyFieldDebug("MIDDLE NAME");
  middleField.allCandidates = middleCandidates.map((c) => ({
    score: c.score,
    reasons: c.reasons,
    box: rectFromBox(c.labelBox),
    lineBox: rectFromBox(c.lineBox),
    lineText: c.lineText,
  }));
  const dobField = makeEmptyFieldDebug("DATE OF BIRTH");
  dobField.allCandidates = dobCandidates.map((c) => ({
    score: c.score,
    reasons: c.reasons,
    box: rectFromBox(c.labelBox),
    lineBox: rectFromBox(c.lineBox),
    lineText: c.lineText,
  }));

  const surnameValue = (() => {
    const cand = chosenSet.surname;
    if (!cand) return { value: null as string | null };
    surnameField.labelFound = true;
    surnameField.chosenCandidate = {
      score: cand.score,
      reasons: cand.reasons,
      box: rectFromBox(cand.labelBox),
      lineBox: rectFromBox(cand.lineBox),
      lineText: cand.lineText,
    };
    surnameField.labelBox = rectFromBox(cand.labelBox);
    const v = extractValueForRow(pageTokens.filter(inPersonalInfo), cand.lineBox, labelColRight, valueWidth);
    surnameField.valueRoi = v.roi;
    surnameField.selectedTokens = v.selected.map((t) => ({ text: String(t.text || "").trim(), box: rectFromBox(t.box) }));
    surnameField.extractedRaw = v.raw;
    const res = validatePersonName(v.raw, "last");
    surnameField.validation = { ok: res.ok, reasons: res.reasons };
    return { value: res.ok ? res.value : null };
  })();

  const firstValue = (() => {
    const cand = chosenSet.first;
    if (!cand) return { value: null as string | null };
    firstField.labelFound = true;
    firstField.chosenCandidate = {
      score: cand.score,
      reasons: cand.reasons,
      box: rectFromBox(cand.labelBox),
      lineBox: rectFromBox(cand.lineBox),
      lineText: cand.lineText,
    };
    firstField.labelBox = rectFromBox(cand.labelBox);
    const v = extractValueForRow(pageTokens.filter(inPersonalInfo), cand.lineBox, labelColRight, valueWidth);
    firstField.valueRoi = v.roi;
    firstField.selectedTokens = v.selected.map((t) => ({ text: String(t.text || "").trim(), box: rectFromBox(t.box) }));
    firstField.extractedRaw = v.raw;
    const res = validatePersonName(v.raw, "first");
    firstField.validation = { ok: res.ok, reasons: res.reasons };
    return { value: res.ok ? res.value : null };
  })();

  const middleValue = (() => {
    const cand = chosenSet.middle;
    if (!cand) return { value: null as string | null };
    middleField.labelFound = true;
    middleField.chosenCandidate = {
      score: cand.score,
      reasons: cand.reasons,
      box: rectFromBox(cand.labelBox),
      lineBox: rectFromBox(cand.lineBox),
      lineText: cand.lineText,
    };
    middleField.labelBox = rectFromBox(cand.labelBox);
    const v = extractValueForRow(pageTokens.filter(inPersonalInfo), cand.lineBox, labelColRight, valueWidth);
    middleField.valueRoi = v.roi;
    middleField.selectedTokens = v.selected.map((t) => ({ text: String(t.text || "").trim(), box: rectFromBox(t.box) }));
    middleField.extractedRaw = v.raw;
    const res = validatePersonName(v.raw, "middle");
    middleField.validation = { ok: res.ok, reasons: res.reasons };
    return { value: res.ok ? res.value : null };
  })();

  const dobValue = (() => {
    const cand = dobCandidates.slice().sort((a, b) => b.score - a.score)[0] ?? null;
    if (!cand) return { value: null as string | null };
    dobField.labelFound = true;
    dobField.chosenCandidate = {
      score: cand.score,
      reasons: cand.reasons,
      box: rectFromBox(cand.labelBox),
      lineBox: rectFromBox(cand.lineBox),
      lineText: cand.lineText,
    };
    dobField.labelBox = rectFromBox(cand.labelBox);
    const v = extractValueForRow(pageTokens.filter(inPersonalInfo), cand.lineBox, labelColRight, 0.22);
    dobField.valueRoi = v.roi;
    dobField.selectedTokens = v.selected.map((t) => ({ text: String(t.text || "").trim(), box: rectFromBox(t.box) }));
    dobField.extractedRaw = v.raw;
    const res = validateDobToIso(v.raw, { templateVersion: version });
    dobField.validation = { ok: res.ok, reasons: res.reasons };
    dobField.parsedIso = res.ok ? res.value : null;
    return { value: res.ok ? res.value : null };
  })();

  const owner: OwnerCandidate | null = surnameValue.value && firstValue.value
    ? {
        last_name: surnameValue.value,
        first_name: firstValue.value,
        middle_name: middleValue.value,
        date_of_birth: dobValue.value,
        confidence: 0.98,
      }
    : null;

  const debug: AnchorOwnerDebug = {
    used: "anchor",
    pageIndex,
    personalInfoHeader: headers.personalInfo ? rectFromBox(headers.personalInfo.box) : null,
    familyHeader: headers.family ? rectFromBox(headers.family.box) : null,
    personalInfoRangeY: {
      start: headers.personalInfo ? headers.personalInfo.box.minY : null,
      end: headers.family ? headers.family.box.minY : null,
    },
    fields: {
      surname: surnameField,
      first_name: firstField,
      middle_name: middleField,
      date_of_birth: dobField,
    },
  };

  return { owner, debug };
}
