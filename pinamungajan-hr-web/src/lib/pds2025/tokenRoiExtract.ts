import { PDS2025_PAGE1_ROIS, type Roi } from "@/lib/pds2025/templateMap";
import { getDocumentAiTokens, type DocToken, type TokenBox } from "@/lib/pds/documentAiTokens";
import { validateDobToIso, validatePersonName } from "@/lib/pds/validators";

export type OwnerCandidate = {
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  name_extension?: string | null;
  date_of_birth: string | null;
  gender?: string | null;
  confidence: number;
};

export type RoiExtractDebug = {
  used: "roi";
  tokensUsed: {
    surname: number;
    first_name: number;
    middle_name: number;
    name_extension: number;
    date_of_birth: number;
  };
  avgTokenConfidence: {
    surname: number | null;
    first_name: number | null;
    middle_name: number | null;
    name_extension: number | null;
    date_of_birth: number | null;
  };
  rejected: Record<string, string[]>;
};

const LABEL_WORDS = new Set([
  "SURNAME", "FIRST", "MIDDLE", "NAME", "DATE", "OF", "BIRTH", "DOB",
  "MIDDLLE", "MIDLE", "MIDDL", "SURNAM", "SURNANE", "F1RST", "F1RSTNAME",
  "B1RTH", "DAT", "BIRTHDATE", "EXTENSION", "JR", "SR", "III", "IV"
]);

function clean(s: string) {
  return String(s || "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[^0-9A-Za-z\-\/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAndRemoveLabels(s: string): string {
  const cleaned = clean(s);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const filtered = words.filter(w => !LABEL_WORDS.has(w.toUpperCase()));
  return filtered.join(" ").trim();
}

function insideRoi(box: TokenBox, roi: Roi) {
  return box.midX >= roi.x && box.midX <= roi.x + roi.w && box.midY >= roi.y && box.midY <= roi.y + roi.h;
}

function avgConfidence(tokens: DocToken[]) {
  const vals = tokens
    .map((t) => (typeof t.confidence === "number" ? t.confidence : null))
    .filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function joinTokensLinewise(tokens: DocToken[]) {
  // Simple join sorted by x.
  const joined = tokens
    .slice()
    .sort((a, b) => a.box.minX - b.box.minX)
    .map((t) => clean(t.text))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return joined;
}

export function extractOwnerFromTokensRoi(document: any): { owner: OwnerCandidate | null; debug: RoiExtractDebug } {
  const tokensRaw = getDocumentAiTokens(document);

  const rejected: Record<string, string[]> = {
    surname: [],
    first_name: [],
    middle_name: [],
    name_extension: [],
    date_of_birth: [],
  };

  const pageIndex = 0;

  const surnameTokens = tokensRaw.filter((t) => t.pageIndex === pageIndex && insideRoi(t.box, PDS2025_PAGE1_ROIS.surname));
  const firstTokens = tokensRaw.filter((t) => t.pageIndex === pageIndex && insideRoi(t.box, PDS2025_PAGE1_ROIS.first_name));
  const middleTokens = tokensRaw.filter((t) => t.pageIndex === pageIndex && insideRoi(t.box, PDS2025_PAGE1_ROIS.middle_name));
  const extTokens = tokensRaw.filter((t) => t.pageIndex === pageIndex && insideRoi(t.box, PDS2025_PAGE1_ROIS.name_extension));
  const dobTokens = tokensRaw.filter((t) => t.pageIndex === pageIndex && insideRoi(t.box, PDS2025_PAGE1_ROIS.date_of_birth));

  const surnameRaw = cleanAndRemoveLabels(joinTokensLinewise(surnameTokens));
  const firstRaw = cleanAndRemoveLabels(joinTokensLinewise(firstTokens));
  const middleRaw = cleanAndRemoveLabels(joinTokensLinewise(middleTokens));
  const extRaw = joinTokensLinewise(extTokens);
  const dobRaw = joinTokensLinewise(dobTokens);

  const lastRes = validatePersonName(surnameRaw, "last");
  if (!lastRes.ok) rejected.surname.push(...lastRes.reasons);
  const firstRes = validatePersonName(firstRaw, "first");
  if (!firstRes.ok) rejected.first_name.push(...firstRes.reasons);
  const middleRes = validatePersonName(middleRaw, "middle");
  if (!middleRes.ok) rejected.middle_name.push(...middleRes.reasons);

  const last_name = lastRes.ok ? lastRes.value : null;
  const first_name = firstRes.ok ? firstRes.value : null;
  const middle_name = middleRes.ok ? middleRes.value : null;

  const name_extension = (() => {
    const cleaned = clean(extRaw);
    if (!cleaned) return null;
    const tok = cleaned.split(" ").find((t) => /^[A-Za-z]{1,4}$/.test(t));
    return tok ? tok.toUpperCase() : null;
  })();

  const dobRes = validateDobToIso(dobRaw, { templateVersion: "2025" });
  if (!dobRes.ok) rejected.date_of_birth.push(...dobRes.reasons);
  const date_of_birth = dobRes.ok ? dobRes.value : null;

  const owner: OwnerCandidate | null = last_name && first_name
    ? {
        last_name,
        first_name,
        middle_name,
        name_extension,
        date_of_birth,
        gender: null,
        confidence: 0.96,
      }
    : null;

  const debug: RoiExtractDebug = {
    used: "roi",
    tokensUsed: {
      surname: surnameTokens.length,
      first_name: firstTokens.length,
      middle_name: middleTokens.length,
      name_extension: extTokens.length,
      date_of_birth: dobTokens.length,
    },
    avgTokenConfidence: {
      surname: avgConfidence(surnameTokens),
      first_name: avgConfidence(firstTokens),
      middle_name: avgConfidence(middleTokens),
      name_extension: avgConfidence(extTokens),
      date_of_birth: avgConfidence(dobTokens),
    },
    rejected,
  };

  return { owner, debug };
}
