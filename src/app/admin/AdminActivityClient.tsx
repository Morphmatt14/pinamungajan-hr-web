"use client";

import { useEffect, useState } from "react";

type ExRow = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
  updated_by_email: string | null;
  original_filename: string | null;
  batch_id: string | null;
};

type EmpRow = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
};

export function AdminActivityClient() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; extractions: ExRow[]; employees: EmpRow[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/activity", { credentials: "include" });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || res.statusText);
        }
        const json = JSON.parse(text) as { extractions: ExRow[]; employees: EmpRow[] };
        if (!cancelled) setState({ status: "ok", extractions: json.extractions || [], employees: json.employees || [] });
      } catch (e) {
        if (!cancelled) {
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <div className="text-sm text-slate-600 dark:text-slate-400">Loading activity…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
        {state.message}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent document uploads & OCR</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Each row shows which HR account started the extraction (upload / pipeline).
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">File</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Status</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Started by</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Updated by</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {state.extractions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No extractions yet.
                  </td>
                </tr>
              ) : (
                state.extractions.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-900/40">
                    <td className="max-w-[200px] truncate px-3 py-2 text-slate-800 dark:text-slate-200">
                      {r.original_filename || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.status}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.created_by_email || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.updated_by_email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Employee records (audit)</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Last updates to masterlist rows (who touched the record last, when audit columns are set).
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Employee</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Created by</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Updated by</th>
                <th className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {state.employees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No employees yet.
                  </td>
                </tr>
              ) : (
                state.employees.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-900/40">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{r.name || "—"}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.created_by_email || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.updated_by_email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                      {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
