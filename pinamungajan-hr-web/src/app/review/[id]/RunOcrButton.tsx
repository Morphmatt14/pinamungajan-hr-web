"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunOcrButton({ extractionId }: { extractionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

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

      const url = `${window.location.origin}/api/ocr`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ extraction_id: extractionId }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res);
        setState({ status: "error", message });
        return;
      }

      setState({ status: "done" });
      try {
        router.refresh();
      } catch {
        // ignore
      }
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to run OCR",
      });
    }
  }

  return (
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
  );
}
