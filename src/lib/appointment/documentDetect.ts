export type DocumentType = "pds" | "appointment" | "certification" | "unknown";

export type AppointmentTemplateVersion = "cs_form_33a_2018" | "unknown";

export function detectDocumentType(fullText: string): {
  type: DocumentType;
  confidence: number;
  evidence: { matched: string[] };
} {
  const t = String(fullText || "");
  const u = t.toUpperCase();
  const matched: string[] = [];

  // Appointment / CSC Form No. 33-A detection markers
  const appointmentMarkers = [
    { pattern: /CS\s*FORM\s*NO\.?\s*33\s*-?\s*A/i, label: "cs_form_33a" },
    { pattern: /APPOINTMENT/i, label: "appointment_keyword" },
    { pattern: /REPUBLIC\s+OF\s+THE\s+PHILIPPINES/i, label: "republic_ph" },
    { pattern: /MUNICIPALITY\s+OF\s+PINAMUNGAJAN/i, label: "municipality_pinamungajan" },
    { pattern: /POSITION\s*TITLE/i, label: "position_title_label" },
    { pattern: /SG\s*[\/\\]\s*JG\s*[\/\\]\s*PG/i, label: "sg_jg_pg_label" },
    { pattern: /PER\s*MONTH/i, label: "per_month_label" },
    { pattern: /DATE\s+OF\s+SIGNING/i, label: "date_of_signing_label" },
    { pattern: /RECEIVED/i, label: "received_stamp" },
    { pattern: /APPROVED/i, label: "approved_stamp" },
    { pattern: /HUMAN\s+RESOURCE\s+MERIT/i, label: "hrmpsb_keyword" },
    { pattern: /CSC\s+ACTION/i, label: "csc_action_keyword" },
    { pattern: /METER\s+READER/i, label: "position_meter_reader" },
    { pattern: /PLANTILLA\s+ITEM\s+NO/i, label: "plantilla_item_no" },
    { pattern: /NEW\s+ITEM/i, label: "new_item_keyword" },
    { pattern: /ORIGINAL\s*-\s*VICE/i, label: "original_vice_keyword" },
    { pattern: /APPOINTING\s+OFFICER/i, label: "appointing_officer_label" },
  ];

  for (const marker of appointmentMarkers) {
    if (marker.pattern.test(t)) {
      matched.push(marker.label);
    }
  }

  // PDS detection markers (existing)
  const pdsMarkers = [
    { pattern: /CS\s*FORM\s*NO\.?\s*212/i, label: "cs_form_212" },
    { pattern: /PERSONAL\s+DATA\s+SHEET/i, label: "personal_data_sheet" },
    { pattern: /PERSONAL\s+INFORMATION/i, label: "personal_information" },
    { pattern: /SURNAME.*FIRST\s+NAME.*MIDDLE\s+NAME/i, label: "name_headers" },
  ];

  const pdsMatched: string[] = [];
  for (const marker of pdsMarkers) {
    if (marker.pattern.test(u)) {
      pdsMatched.push(marker.label);
    }
  }

  // Calculate confidence scores
  const appointmentScore = matched.length;
  const pdsScore = pdsMatched.length;

  // Decision logic
  if (appointmentScore >= 3 && appointmentScore > pdsScore) {
    return {
      type: "appointment",
      confidence: Math.min(1, appointmentScore / 5),
      evidence: { matched },
    };
  }

  if (pdsScore >= 2) {
    return {
      type: "pds",
      confidence: Math.min(1, pdsScore / 4),
      evidence: { matched: pdsMatched },
    };
  }

  return { type: "unknown", confidence: 0, evidence: { matched } };
}

export function detectAppointmentTemplateVersion(fullText: string): {
  version: AppointmentTemplateVersion;
  evidence: { matched: string[] };
} {
  const t = String(fullText || "");
  const u = t.toUpperCase();
  const matched: string[] = [];

  if (u.includes("CS FORM NO. 33-A") || u.includes("CS FORM 33-A") || u.includes("CS FORM NO 33-A")) {
    matched.push("cs_form_33a_header");
  }

  if (u.includes("REVISED 2018") || u.includes("(REVISED 2018")) {
    matched.push("revised_2018");
    return { version: "cs_form_33a_2018", evidence: { matched } };
  }

  return { version: "unknown", evidence: { matched } };
}

export function isAppointmentDocument(fullText: string): boolean {
  const result = detectDocumentType(fullText);
  return result.type === "appointment" && result.confidence >= 0.4;
}
