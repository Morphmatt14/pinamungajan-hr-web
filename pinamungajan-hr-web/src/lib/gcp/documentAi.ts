import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

export function getDocumentAiConfig() {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.DOCUMENT_AI_LOCATION;
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

  if (!projectId) throw new Error("Missing GCP_PROJECT_ID");
  if (!location) throw new Error("Missing DOCUMENT_AI_LOCATION");
  if (!processorId) throw new Error("Missing DOCUMENT_AI_PROCESSOR_ID");

  return { projectId, location, processorId };
}

export function createDocumentAiClient() {
  return new DocumentProcessorServiceClient();
}

export function getProcessorName() {
  const { projectId, location, processorId } = getDocumentAiConfig();
  return `projects/${projectId}/locations/${location}/processors/${processorId}`;
}
