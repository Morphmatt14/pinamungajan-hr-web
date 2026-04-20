function readEnv(...keys: string[]) {
  for (const k of keys) {
    const v = process.env[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

function getBaseUrl() {
  const explicit = readEnv("APP_BASE_URL", "NEXT_PUBLIC_APP_URL", "SITE_URL");
  if (explicit) return explicit.replace(/\/$/, "");

  const renderUrl = readEnv("RENDER_EXTERNAL_URL");
  if (renderUrl) return renderUrl.replace(/\/$/, "");

  const vercelUrl = readEnv("VERCEL_URL");
  if (vercelUrl) return `https://${vercelUrl}`;

  return "";
}

/**
 * Starts OCR asynchronously by POSTing to /api/ocr with the worker secret.
 * Does not wait for OCR to finish (same idea as the old QStash publish).
 */
export async function triggerOcrJob(input: { extractionId: string }) {
  const extractionId = String(input?.extractionId || "").trim();
  if (!extractionId) throw new Error("Missing extractionId");

  const workerSecret = readEnv("OCR_WORKER_SECRET");
  if (!workerSecret) throw new Error("Missing OCR_WORKER_SECRET");

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "Missing public app URL: set APP_BASE_URL (or NEXT_PUBLIC_APP_URL / SITE_URL / RENDER_EXTERNAL_URL / VERCEL_URL)"
    );
  }

  const url = `${baseUrl}/api/ocr`;
  const body = JSON.stringify({ extraction_id: extractionId, source: "internal" });

  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ocr-worker-secret": workerSecret,
    },
    body,
  }).catch((e) => {
    console.error("[triggerOcrJob] fetch failed:", e);
  });

  return true;
}
