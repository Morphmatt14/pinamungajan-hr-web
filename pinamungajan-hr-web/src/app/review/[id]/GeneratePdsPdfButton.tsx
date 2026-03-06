"use client";

import { useState } from "react";

export function GeneratePdsPdfButton({
  extractionId,
  batchId,
  documentSetId,
}: {
  extractionId: string;
  batchId?: string | null;
  documentSetId?: string | null;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  function getFilenameFromContentDisposition(header: string | null) {
    if (!header) return null;
    const m = header.match(/filename=([^;\n]+)/i);
    if (!m) return null;
    return m[1].trim().replace(/^"|"$/g, "");
  }

  async function downloadFrom(endpointUrl: string, fallbackName: string) {
    try {
      setState({ status: "loading" });
      const res = await fetch(endpointUrl, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate PDF");
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = getFilenameFromContentDisposition(res.headers.get("content-disposition")) ?? fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);

      setState({ status: "done" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function run() {
    const url = new URL(`${window.location.origin}/api/pds/printable-pdf`);
    url.searchParams.set("extraction_id", extractionId);
    await downloadFrom(url.toString(), `PRINTABLE-${extractionId}.pdf`);
  }

  async function runImage() {
    if (documentSetId || batchId) {
      const url = new URL(`${window.location.origin}/api/pds/batch-normalized-zip`);
      if (documentSetId) url.searchParams.set("document_set_id", String(documentSetId));
      else if (batchId) url.searchParams.set("batch_id", String(batchId));
      await downloadFrom(url.toString(), `SCAN-${extractionId}-normalized-images.zip`);
      return;
    }

    const url = new URL(`${window.location.origin}/api/pds/printable-image`);
    url.searchParams.set("extraction_id", extractionId);
    url.searchParams.set("page", "1");
    await downloadFrom(url.toString(), `SCAN-${extractionId}-page1.png`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state.status === "loading"}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {state.status === "loading" ? "Generating…" : "Download Printable PDF"}
      </button>
      <button
        type="button"
        onClick={runImage}
        disabled={state.status === "loading"}
        className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        Download Printable Image
      </button>
      {state.status === "done" ? <span className="text-xs text-emerald-700">Ready</span> : null}
      {state.status === "error" ? <span className="text-xs text-red-700">{state.message}</span> : null}
    </div>
  );
}
