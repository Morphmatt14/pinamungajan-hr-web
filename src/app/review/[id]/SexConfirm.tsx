"use client";

import { useState } from "react";

export function SexConfirm({
  extractionId,
  canConfirm,
  initialValue,
  isConfirmed = false,
}: {
  extractionId: string;
  canConfirm: boolean;
  initialValue?: "Male" | "Female" | null;
  isConfirmed?: boolean;
}) {
  const [selected, setSelected] = useState<"Male" | "Female" | null>(initialValue ?? null);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "done"; value: "Male" | "Female" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function confirm() {
    if (!selected) return;
    try {
      setState({ status: "saving" });
      const res = await fetch("/api/extractions/sex-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ extraction_id: extractionId, value: selected }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setState({ status: "done", value: selected });
      window.location.reload();
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (state.status === "done") {
    return (
      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="text-xs font-semibold text-emerald-900">Confirmed: Sex at Birth = {state.value}</div>
      </div>
    );
  }

  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 ${isConfirmed ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
      <div className={`text-xs font-semibold ${isConfirmed ? "text-slate-700" : "text-amber-900"}`}>
        {isConfirmed ? `Current: Sex at Birth = ${initialValue}` : "Needs manual confirmation"}
      </div>
      <div className={`mt-1 text-xs ${isConfirmed ? "text-slate-600" : "text-amber-900"}`}>
        {isConfirmed ? "Review/change if incorrect:" : "Select Sex at Birth:"}
      </div>
      
      <div className="mt-2 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected === "Male"}
            onChange={() => setSelected("Male")}
            disabled={!canConfirm || state.status === "saving"}
            className="h-4 w-4 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className={`text-sm ${isConfirmed ? "text-slate-800" : "text-amber-900"}`}>Male</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected === "Female"}
            onChange={() => setSelected("Female")}
            disabled={!canConfirm || state.status === "saving"}
            className="h-4 w-4 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className={`text-sm ${isConfirmed ? "text-slate-800" : "text-amber-900"}`}>Female</span>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={!canConfirm || !selected || state.status === "saving"}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {state.status === "saving" ? "Saving..." : isConfirmed ? "Update" : "Confirm"}
        </button>
        {!canConfirm ? (
          <span className={`text-xs ${isConfirmed ? "text-slate-600" : "text-amber-900"}`}>
            No linked employee yet. Link owner first.
          </span>
        ) : selected !== initialValue ? (
          <span className="text-xs text-indigo-700">
            {isConfirmed ? "Selection changed - click Update to save" : "Click Confirm to save"}
          </span>
        ) : null}
        {state.status === "error" ? <span className="text-xs text-red-700">{state.message}</span> : null}
      </div>
    </div>
  );
}
