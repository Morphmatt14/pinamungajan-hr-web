export type PdsTemplateVersion = "2018" | "2025" | "unknown";

export function detectPdsTemplateVersionFromText(fullText: string): {
  version: PdsTemplateVersion;
  evidence: { matched: string[] };
} {
  const t = String(fullText || "");
  const u = t.toUpperCase();

  const matched: string[] = [];

  if (u.includes("CS FORM NO. 212") || u.includes("CS FORM 212") || u.includes("CS FORM NO 212")) {
    matched.push("cs_form_212");
  }

  if (u.includes("REVISED 2025") || u.includes("(REVISED 2025") || u.includes("REVISED, 2025")) {
    matched.push("revised_2025");
    return { version: "2025", evidence: { matched } };
  }

  if (u.includes("REVISED 2018") || u.includes("(REVISED 2018") || u.includes("REVISED, 2018") || 
      u.includes("REVISED 2017") || u.includes("(REVISED 2017") || u.includes("REVISED, 2017")) {
    matched.push("revised_2018_or_2017");
    return { version: "2018", evidence: { matched } };
  }

  // Some scans omit the header; treat as unknown.
  return { version: "unknown", evidence: { matched } };
}
