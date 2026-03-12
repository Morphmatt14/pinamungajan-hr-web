"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorker, type Worker } from "tesseract.js";
import type { DocToken } from "@/lib/pds/documentAiTokens";

export function RunOcrButton({ extractionId }: { extractionId: string }) {
  const router = useRouter();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (state.status !== "running") {
      setElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    const t = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => window.clearInterval(t);
  }, [state.status]);

  async function readErrorMessage(res: Response) {
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const j: any = await res.json();
        const parts: string[] = [];
        if (j?.error) parts.push(String(j.error));
        if (j?.details) parts.push(String(j.details));
        if (j?.suggestion) parts.push(String(j.suggestion));
        const msg = parts.filter(Boolean).join(" — ").trim();
        return msg || res.statusText;
      }
    } catch {
      // ignore
    }

    try {
      const text = await res.text();
      return text || res.statusText;
    } catch {
      return res.statusText;
    }
  }

  async function run() {
    let worker: Worker | null = null;
    try {
      setState({ status: "running" });

      // 1. Get the image URL for this extraction
      // For simplicity, we assume the original upload is accessible. 
      // We'll fetch the extraction metadata first to get the URL.
      const metaRes = await fetch(`/api/extractions/${extractionId}`);
      if (!metaRes.ok) throw new Error("Failed to fetch extraction metadata");
      const meta = await metaRes.json();
      
      if (!meta?.file_url) throw new Error("No image file found for this document");

      // 2. Perform OCR in the browser
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            // progress could be tracked here
          }
        },
        langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
      });

      const ocrResult = await worker.recognize(meta.file_url);
      
      // 2.1 Get image dimensions for normalization
      const img = new Image();
      img.src = meta.file_url;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // Continue even if image fails to load for naturalWidth
      });
      const width = img.naturalWidth || 1000;
      const height = img.naturalHeight || 1000;

      const words = (ocrResult.data as any).words || [];
      const tokens: DocToken[] = words.map((word: any) => ({
        pageIndex: 0,
        text: word.text,
        confidence: word.confidence / 100,
        box: {
          minX: word.bbox.x0 / width,
          maxX: word.bbox.x1 / width,
          minY: word.bbox.y0 / height,
          maxY: word.bbox.y1 / height,
          midX: ((word.bbox.x0 + word.bbox.x1) / 2) / width,
          midY: ((word.bbox.y0 + word.bbox.y1) / 2) / height,
        },
      }));

      // 3. Send the pre-generated tokens to the backend
      const res = await fetch(`${window.location.origin}/api/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          extraction_id: extractionId,
          tokens: tokens,
          full_text: ocrResult.data.text
        }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res);
        setState({ status: "error", message });
        return;
      }

      setState({ status: "done" });
      router.refresh();
    } catch (e) {
      console.error("Client OCR Error:", e);
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to run OCR",
      });
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {state.status === "running" ? (
        <div className="w-full max-w-[420px]">
          <div className="h-1 w-full overflow-hidden rounded bg-slate-200">
            <div className="h-full w-1/3 animate-pulse rounded bg-slate-900" />
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            Processing OCR… {Math.max(0, Math.round(elapsedMs / 1000))}s
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state.status === "running"}
        className="min-w-[96px] rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {state.status === "running" ? "Running..." : "Run OCR"}
      </button>
      {state.status === "done" ? (
        <span className="text-xs text-emerald-700">Done</span>
      ) : null}
      {state.status === "error" ? (
        <span className="max-w-[420px] break-words text-xs text-red-700" title={state.message}>
          {state.message || "OCR failed"}
        </span>
      ) : null}
      </div>
    </div>
  );
}
