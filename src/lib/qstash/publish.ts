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

  const vercelUrl = readEnv("VERCEL_URL");
  if (vercelUrl) return `https://${vercelUrl}`;

  return "";
}

export async function enqueueOcrJob(input: { extractionId: string }) {
  const extractionId = String(input?.extractionId || "").trim();
  if (!extractionId) throw new Error("Missing extractionId");

  const token = readEnv("QSTASH_TOKEN");
  if (!token) throw new Error("Missing QSTASH_TOKEN");

  const workerSecret = readEnv("OCR_WORKER_SECRET");
  if (!workerSecret) throw new Error("Missing OCR_WORKER_SECRET");

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing APP_BASE_URL (or VERCEL_URL) for QStash publish destination");
  }

  const url = `${baseUrl}/api/ocr`;

  const res = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(url)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Forward the internal worker secret to our API route.
      // QStash will include this header when it delivers the message.
      "Upstash-Forward-x-ocr-worker-secret": workerSecret,
    },
    body: JSON.stringify({ extraction_id: extractionId, source: "qstash" }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || res.statusText);
  }

  return true;
}
