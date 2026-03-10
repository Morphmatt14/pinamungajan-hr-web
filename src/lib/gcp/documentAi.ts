import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

function readEnv(...keys: string[]) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parseServiceAccountJson(raw: string) {
  const v = String(raw || "").trim();
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    // Support Vercel-style single-line JSON with escaped newlines.
    try {
      return JSON.parse(v.replace(/\\n/g, "\n"));
    } catch {
      return null;
    }
  }
}

export function getDocumentAiConfig() {
  const credentialsJsonRaw = readEnv("GCP_SERVICE_ACCOUNT_JSON", "GOOGLE_CLOUD_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS_JSON");
  const credentials = credentialsJsonRaw ? parseServiceAccountJson(credentialsJsonRaw) : null;

  const projectIdFromEnv = readEnv("GCP_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT");
  const projectId = projectIdFromEnv || String(credentials?.project_id || "").trim();
  const location = readEnv("DOCUMENT_AI_LOCATION", "GCP_DOCUMENT_AI_LOCATION");
  const processorId = readEnv("DOCUMENT_AI_PROCESSOR_ID", "GCP_DOCUMENT_AI_PROCESSOR_ID");

  const missing: string[] = [];
  if (!projectId) missing.push("GCP_PROJECT_ID");
  if (!location) missing.push("DOCUMENT_AI_LOCATION");
  if (!processorId) missing.push("DOCUMENT_AI_PROCESSOR_ID");
  if (!credentials) missing.push("GCP_SERVICE_ACCOUNT_JSON");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }

  return { projectId, location, processorId, credentials };
}

export function createDocumentAiClient() {
  const cfg = getDocumentAiConfig();
  return new DocumentProcessorServiceClient({ projectId: cfg.projectId, credentials: cfg.credentials });
}

export function getProcessorName() {
  const { projectId, location, processorId } = getDocumentAiConfig();
  return `projects/${projectId}/locations/${location}/processors/${processorId}`;
}
