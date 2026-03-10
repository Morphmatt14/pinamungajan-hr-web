"use client";

import { useMemo, useState } from "react";

export function SexAtBirthOverride({ extractionId, initialGender }: { extractionId: string; initialGender: string | null }) {
  const [value, setValue] = useState<string>(initialGender || "");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const normalized = useMemo(() => {
    const v = String(value || "").toLowerCase();
    if (v === "male") return "Male";
    if (v === "female") return "Female";
    return "";
  }, [value]);

  async function save() {
    try {
      if (!normalized) {
        setState({ status: "error", message: "Select Male or Female" });
        return;
      }

      setState({ status: "saving" });

      const url = `${window.location.origin}/api/extractions/gender`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ extraction_id: extractionId, gender: normalized }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to save");
      }

      setState({ status: "done" });
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message: msg });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-semibold text-slate-900">Set Sex at birth (manual)</div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 sm:w-48"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState({ status: "idle" });
          }}
        >
          <option value="">Select…</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <button
          type="button"
          onClick={save}
          disabled={state.status === "saving"}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {state.status === "saving" ? "Saving…" : "Save"}
        </button>

        {state.status === "done" ? <span className="text-xs text-emerald-700">Saved</span> : null}
        {state.status === "error" ? <span className="text-xs text-red-700">{state.message}</span> : null}
      </div>
      <div className="text-[11px] text-slate-700">
        Use this when OCR cannot determine the checked box.
      </div>
    </div>
  );
}
