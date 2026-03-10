"use client";

import { useState } from "react";

export function DeleteEmployeeButton({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "confirm" }
    | { status: "deleting" }
    | { status: "done"; warning?: string | null }
    | { status: "error"; message: string; httpStatus?: number }
  >({ status: "idle" });

  const isDeleting = state.status === "deleting";

  async function doDelete() {
    try {
      setState({ status: "deleting" });

      const url = `${window.location.origin}/api/employees/delete`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employee_id: employeeId }),
      });

      if (!res.ok) {
        const text = await res.text();
        setState({
          status: "error",
          httpStatus: res.status,
          message: text || res.statusText || "Delete failed",
        });
        return;
      }

      let warning: string | null = null;
      try {
        const json = (await res.json()) as any;
        warning = json?.warning ?? null;
      } catch {
        // ignore
      }

      if (warning) {
        setState({ status: "done", warning });
        setTimeout(() => window.location.reload(), 600);
      } else {
        window.location.reload();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message: msg });
    }
  }

  if (state.status === "confirm") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={doDelete}
          disabled={isDeleting}
          className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setState({ status: "idle" })}
          disabled={isDeleting}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setState({ status: "confirm" })}
        disabled={isDeleting}
        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {state.status === "deleting" ? "Deleting…" : "Delete"}
      </button>
      {state.status === "done" && state.warning ? (
        <div className="text-[11px] text-amber-700">{state.warning}</div>
      ) : null}
      {state.status === "error" ? (
        <div className="text-[11px] text-red-700">
          {typeof state.httpStatus === "number" ? `HTTP ${state.httpStatus}: ` : ""}
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
