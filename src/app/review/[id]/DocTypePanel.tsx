"use client";

import { DocumentType } from "@/lib/document/detection";

interface DocTypePanelProps {
  extractionId: string;
  docTypeUserSelected: string | null;
  docTypeDetected: string | null;
  docTypeFinal: string | null;
  docTypeMismatchWarning: boolean;
}

export function DocTypePanel({
  extractionId,
  docTypeUserSelected,
  docTypeDetected,
  docTypeFinal,
  docTypeMismatchWarning,
}: DocTypePanelProps) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Document Type</div>
      <div className="mt-2 grid gap-2 text-sm">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
            <div className="rounded-md bg-white px-2 py-1">
              <div className="text-[11px] font-semibold text-slate-900">User Selected</div>
              <div className="mt-0.5 text-xs text-slate-900">
                {docTypeUserSelected || "Auto-detect"}
              </div>
            </div>
            <div className="rounded-md bg-white px-2 py-1">
              <div className="text-[11px] font-semibold text-slate-900">Detected</div>
              <div className="mt-0.5 text-xs text-slate-900">
                {docTypeDetected || "—"}
              </div>
            </div>
            <div className="rounded-md bg-white px-2 py-1">
              <div className="text-[11px] font-semibold text-slate-900">Final Type Used</div>
              <div className="mt-0.5 text-xs font-semibold text-blue-700">
                {docTypeFinal || "—"}
              </div>
            </div>
          </div>
          
          {/* Mismatch Warning */}
          {docTypeMismatchWarning && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs font-semibold text-amber-900">
                ⚠️ Type Mismatch Detected
              </div>
              <div className="mt-1 text-xs text-amber-800">
                The system detected this document as <strong>{docTypeDetected}</strong>, 
                but you selected <strong>{docTypeUserSelected}</strong>. 
                Please review and confirm the correct type.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-100"
                  onClick={() => {
                    alert("Re-running OCR with detected type: " + docTypeDetected);
                  }}
                >
                  Use Detected Type
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                >
                  Keep Selected Type
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
