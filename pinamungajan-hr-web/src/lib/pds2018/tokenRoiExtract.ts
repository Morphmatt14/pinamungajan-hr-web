import { getDocumentAiTokens, type TokenBox } from "@/lib/pds/documentAiTokens";
import { validateDobToIso, validatePersonName } from "@/lib/pds/validators";
import { PDS2018_PAGE1_ROIS, type Roi } from "@/lib/pds2018/templateMap";

export type OwnerCandidate = {
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  date_of_birth: string | null;
  confidence: number;
};

export type RoiExtractDebug = {
  used: "roi";
  tokensUsed: { surname: number; first_name: number; middle_name: number; date_of_birth: number };
  rejected: Record<string, string[]>;
};

const LABEL_WORDS = new Set([
  "SURNAME", "FIRST", "MIDDLE", "NAME", "DATE", "OF", "BIRTH", "DOB",
  "MIDDLLE", "MIDLE", "MIDDL", "SURNAM", "SURNANE", "F1RST", "F1RSTNAME",
  "B1RTH", "DAT", "BIRTHDATE"
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

function join(tokens: Array<{ text: string; box: TokenBox }>) {
  const joined = tokens
    .slice()
    .sort((a, b) => a.box.minX - b.box.minX)
    .map((t) => clean(t.text))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return cleanAndRemoveLabels(joined);
}

export function extractOwnerFromTokensRoi2018(document: any): { owner: OwnerCandidate | null; debug: RoiExtractDebug } {
  const tokens = getDocumentAiTokens(document);
  const pageIndex = 0;
  const pageTokens = tokens.filter((t) => t.pageIndex === pageIndex);

  const rejected: Record<string, string[]> = {
    surname: [],
    first_name: [],
    middle_name: [],
    date_of_birth: [],
  };

  const surnameTokens = pageTokens.filter((t) => insideRoi(t.box, PDS2018_PAGE1_ROIS.surname));
  const firstTokens = pageTokens.filter((t) => insideRoi(t.box, PDS2018_PAGE1_ROIS.first_name));
  const middleTokens = pageTokens.filter((t) => insideRoi(t.box, PDS2018_PAGE1_ROIS.middle_name));
  const dobTokens = pageTokens.filter((t) => insideRoi(t.box, PDS2018_PAGE1_ROIS.date_of_birth));

  const surnameRaw = join(surnameTokens);
  const firstRaw = join(firstTokens);
  const middleRaw = join(middleTokens);
  const dobRaw = join(dobTokens);

  const lastRes = validatePersonName(surnameRaw, "last");
  if (!lastRes.ok) rejected.surname.push(...lastRes.reasons);
  const firstRes = validatePersonName(firstRaw, "first");
  if (!firstRes.ok) rejected.first_name.push(...firstRes.reasons);
  const middleRes = validatePersonName(middleRaw, "middle");
  if (!middleRes.ok) rejected.middle_name.push(...middleRes.reasons);

  const dobRes = validateDobToIso(dobRaw, { templateVersion: "2018" });
  if (!dobRes.ok) rejected.date_of_birth.push(...dobRes.reasons);

  const owner: OwnerCandidate | null = lastRes.ok && firstRes.ok
    ? {
        last_name: lastRes.value,
        first_name: firstRes.value,
        middle_name: middleRes.ok ? middleRes.value : null,
        date_of_birth: dobRes.ok ? dobRes.value : null,
        confidence: 0.94,
      }
    : null;

  return {
    owner,
    debug: {
      used: "roi",
      tokensUsed: {
        surname: surnameTokens.length,
        first_name: firstTokens.length,
        middle_name: middleTokens.length,
        date_of_birth: dobTokens.length,
      },
      rejected,
    },
  };
}
