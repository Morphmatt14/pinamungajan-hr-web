"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateDdMmYyyy } from "@/lib/pds/validators";
import { useRouter } from "next/navigation";

type Candidate = {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  date_of_birth: string | null;
};

type SearchEmployee = {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  date_of_birth: string | null;
};

function normalizeDisplayName(e: any) {
  const ln = String(e.last_name || "").trim();
  const fn = String(e.first_name || "").trim();
  const mn = String(e.middle_name || "").trim();
  return `${ln}, ${fn}${mn ? ` ${mn}` : ""}`.trim();
}

function useDebouncedValue<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CommitEmployeePanel({
  extractionId,
  initialLinkedEmployeeId,
  owner,
}: {
  extractionId: string;
  initialLinkedEmployeeId: string | null;
  owner: {
    last_name: string | null;
    first_name: string | null;
    middle_name: string | null;
    date_of_birth: string | null;
  };
}) {
  const router = useRouter();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(initialLinkedEmployeeId);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [searchResults, setSearchResults] = useState<SearchEmployee[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");

  const [commitState, setCommitState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "done"; employeeId: string }
    | { status: "needs_confirmation"; reason: string; candidates: Candidate[] }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const q = debouncedSearch.trim();
      if (!q) {
        setSearchResults([]);
        setSearchState("idle");
        return;
      }

      setSearchState("loading");
      try {
        const url = new URL(`${window.location.origin}/api/masterlist/employees`);
        url.searchParams.set("q", q);
        url.searchParams.set("page", "1");
        url.searchParams.set("pageSize", "10");

        const res = await fetch(url.toString(), { credentials: "include" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        const json = JSON.parse(text) as { employees: SearchEmployee[] };
        if (cancelled) return;
        setSearchResults(json.employees || []);
        setSearchState("idle");
      } catch {
        if (cancelled) return;
        setSearchState("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  async function commit(opts?: { forceCreateNew?: boolean; employeeId?: string | null }) {
    try {
      setCommitState({ status: "saving" });

      const url = `${window.location.origin}/api/review/commit`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          extraction_id: extractionId,
          employee_id: opts?.employeeId ?? selectedEmployeeId ?? null,
          force_create_new: Boolean(opts?.forceCreateNew),
        }),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);
      const json = JSON.parse(text) as any;

      if (json?.needs_confirmation) {
        setCommitState({
          status: "needs_confirmation",
          reason: String(json.reason || "needs_confirmation"),
          candidates: (json.candidates || []) as Candidate[],
        });
        return;
      }

      const employeeId = String(json.employee_id || "");
      if (!employeeId) throw new Error("Commit succeeded but no employee_id returned.");

      setSelectedEmployeeId(employeeId);
      setCommitState({ status: "done", employeeId });

      try {
        router.refresh();
      } catch {
        // ignore
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCommitState({ status: "error", message: msg });
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Save to Masterlist</div>
      <div className="mt-1 text-xs text-slate-700">
        This step links this document to an employee and ensures the employee appears in Masterlist.
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold text-slate-900">OCR owner</div>
          <div className="mt-1 text-sm text-slate-900">
            {normalizeDisplayName(owner)}
          </div>
          <div className="mt-1 text-xs text-slate-700">DOB: {formatDateDdMmYyyy(owner.date_of_birth)}</div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold text-slate-900">Link to existing employee (optional)</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees (name)"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          />
          {searchState === "loading" ? <div className="mt-1 text-xs text-slate-600">Searching…</div> : null}
          {searchState === "error" ? <div className="mt-1 text-xs text-red-700">Search failed</div> : null}

          {searchResults.length > 0 ? (
            <div className="mt-2 max-h-[160px] overflow-auto rounded-md border bg-white">
              {searchResults.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${
                    selectedEmployeeId === e.id ? "bg-slate-100" : ""
                  }`}
                  onClick={() => {
                    setSelectedEmployeeId(e.id);
                    setCommitState({ status: "idle" });
                  }}
                >
                  <span className="text-slate-900">{normalizeDisplayName(e)}</span>
                  <span className="font-mono text-slate-600">{formatDateDdMmYyyy((e as any).date_of_birth)}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 text-xs text-slate-700">
            Selected employee_id: <span className="font-mono">{selectedEmployeeId || "(none)"}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => commit()}
          disabled={commitState.status === "saving"}
          className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {commitState.status === "saving" ? "Saving…" : "Save"}
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedEmployeeId(null);
            setCommitState({ status: "idle" });
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          Clear selection
        </button>

        {commitState.status === "done" ? (
          <span className="text-xs text-emerald-700">
            Saved. employee_id=<span className="font-mono">{commitState.employeeId}</span>
          </span>
        ) : null}

        {commitState.status === "error" ? <span className="text-xs text-red-700">{commitState.message}</span> : null}
      </div>

      {commitState.status === "needs_confirmation" ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-xs font-semibold text-amber-900">Is this the same person?</div>
          <div className="mt-1 text-xs text-amber-900">
            We found possible existing employees that match the name{commitState.reason === "dob_missing" ? " (DOB missing)" : ""}.
          </div>

          <div className="mt-2 grid gap-2">
            {commitState.candidates.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 rounded-md bg-white px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-slate-900">
                  <div className="font-semibold">{normalizeDisplayName(c)}</div>
                  <div className="font-mono text-slate-700">DOB: {formatDateDdMmYyyy(c.date_of_birth)}</div>
                  <div className="font-mono text-slate-700">id: {c.id}</div>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-amber-700 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                  onClick={() => commit({ employeeId: c.id })}
                >
                  Yes, link
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2">
            <button
              type="button"
              className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              onClick={() => commit({ forceCreateNew: true, employeeId: null })}
            >
              No, create new employee
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
