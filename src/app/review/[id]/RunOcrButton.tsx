"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
    try {
      setState({ status: "running" });

      const controller = new AbortController();
      const timeoutMs = 240_000;
      const t = window.setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`/api/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ extraction_id: extractionId }),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(t));

      if (!res.ok) {
        const message = await readErrorMessage(res);
        setState({ status: "error", message });
        return;
      }

      setState({ status: "done" });
      router.refresh();
    } catch (e) {
      console.error("Client OCR Error:", e);
      if (e instanceof DOMException && e.name === "AbortError") {
        setState({
          status: "error",
          message: "OCR timed out. Please retry. If this keeps happening, check Google Document AI billing/credentials or reduce pages.",
        });
        return;
      }
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to run OCR",
      });
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
