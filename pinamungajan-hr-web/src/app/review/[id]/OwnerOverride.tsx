"use client";

import { useEffect, useMemo, useState } from "react";

export function OwnerOverride({
  extractionId,
  initial,
}: {
  extractionId: string;
  initial: {
    last_name: string | null;
    first_name: string | null;
    middle_name: string | null;
    date_of_birth: string | null;
  };
}) {
  const [lastName, setLastName] = useState(initial.last_name ?? "");
  const [firstName, setFirstName] = useState(initial.first_name ?? "");
  const [middleName, setMiddleName] = useState(initial.middle_name ?? "");
  const [dob, setDob] = useState(initial.date_of_birth ?? "");

  useEffect(() => {
    setLastName(initial.last_name ?? "");
    setFirstName(initial.first_name ?? "");
    setMiddleName(initial.middle_name ?? "");
    setDob(initial.date_of_birth ?? "");
    setState({ status: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractionId]);

  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const payload = useMemo(
    () => ({
      extraction_id: extractionId,
      last_name: lastName.trim(),
      first_name: firstName.trim(),
      middle_name: middleName.trim(),
      date_of_birth: dob.trim() || null,
    }),
    [dob, extractionId, firstName, lastName, middleName]
  );

  async function save() {
    try {
      if (!payload.last_name || !payload.first_name) {
        setState({ status: "error", message: "Last name and First name are required" });
        return;
      }

      setState({ status: "saving" });
      const url = `${window.location.origin}/api/extractions/owner`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
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
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-semibold text-slate-900">Correct Owner details (manual)</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-[11px] font-semibold text-slate-900">Last name</div>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              setState({ status: "idle" });
            }}
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-900">First name</div>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setState({ status: "idle" });
            }}
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-900">Middle name</div>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={middleName}
            onChange={(e) => {
              setMiddleName(e.target.value);
              setState({ status: "idle" });
            }}
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-900">Date of birth (dd/mm/yyyy)</div>
          <input
            placeholder="dd/mm/yyyy"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={dob}
            onChange={(e) => {
              setDob(e.target.value);
              setState({ status: "idle" });
            }}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
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
    </div>
  );
}
