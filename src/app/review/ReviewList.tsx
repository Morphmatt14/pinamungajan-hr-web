import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExtractionRow } from "@/lib/types";

export async function ReviewList() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("extractions")
    .select("id, document_id, status, quality_score, warnings, errors, created_at, updated_at, batch_id, document_set_id, created_by")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return <div className="app-alert-danger text-sm">Error: {error.message}</div>;
  }

  const rows = (data || []) as (ExtractionRow & { batch_id?: string | null; document_set_id?: string | null; created_by?: string | null })[];

  // Group by document_set_id (preferred), otherwise by batch_id.
  const byGroupKey = new Map<
    string,
    {
      kind: "document_set" | "batch";
      id: string;
      group: typeof rows;
    }
  >();
  const singles: typeof rows = [];

  for (const r of rows) {
    const ds = (r as any).document_set_id ? String((r as any).document_set_id) : "";
    const b = (r as any).batch_id ? String((r as any).batch_id) : "";

    if (ds) {
      const k = `ds:${ds}`;
      const existing = byGroupKey.get(k);
      if (existing) existing.group.push(r);
      else byGroupKey.set(k, { kind: "document_set", id: ds, group: [r] });
      continue;
    }

    if (b) {
      const k = `batch:${b}`;
      const existing = byGroupKey.get(k);
      if (existing) existing.group.push(r);
      else byGroupKey.set(k, { kind: "batch", id: b, group: [r] });
      continue;
    }

    singles.push(r);
  }

  // Compute page/file counts from employee_documents.
  const documentSetIds = Array.from(new Set(rows.map((r) => ((r as any).document_set_id ? String((r as any).document_set_id) : "")).filter(Boolean)));
  const batchIds = Array.from(
    new Set(
      rows
        .filter((r) => !(r as any).document_set_id)
        .map((r) => ((r as any).batch_id ? String((r as any).batch_id) : ""))
        .filter(Boolean)
    )
  );

  const countsByDs = new Map<string, number>();
  const countsByBatch = new Map<string, number>();

  if (documentSetIds.length > 0) {
    const { data: docs } = await supabase
      .from("employee_documents")
      .select("id, document_set_id")
      .in("document_set_id", documentSetIds);
    for (const d of docs || []) {
      const id = d.document_set_id ? String(d.document_set_id) : "";
      if (!id) continue;
      countsByDs.set(id, (countsByDs.get(id) || 0) + 1);
    }
  }

  if (batchIds.length > 0) {
    const { data: docs } = await supabase.from("employee_documents").select("id, batch_id").in("batch_id", batchIds);
    for (const d of docs || []) {
      const id = d.batch_id ? String(d.batch_id) : "";
      if (!id) continue;
      countsByBatch.set(id, (countsByBatch.get(id) || 0) + 1);
    }
  }

  const groups = Array.from(byGroupKey.values())
    .map((g) => ({
      ...g,
      group: g.group.slice().sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
      fileCount:
        g.kind === "document_set" ? countsByDs.get(g.id) || g.group.length : countsByBatch.get(g.id) || g.group.length,
    }))
    .sort((a, b) => {
      const aT = a.group[a.group.length - 1]?.updated_at || a.group[a.group.length - 1]?.created_at;
      const bT = b.group[b.group.length - 1]?.updated_at || b.group[b.group.length - 1]?.created_at;
      return +new Date(String(bT)) - +new Date(String(aT));
    });

  return (
    <div className="app-card overflow-hidden">
      <div className="app-card-header">Latest extractions</div>
      <div className="divide-y divide-app-border">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-app-muted">No extractions yet.</div>
        ) : (
          <>
            {groups.map(({ kind, id, group, fileCount }: { kind: "document_set" | "batch"; id: string; group: typeof rows; fileCount: number }) => (
              <details key={`${kind}:${id}`} className="group px-4 py-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-semibold text-app-text">
                        {kind === "document_set" ? "Document set" : "Batch upload"} · {fileCount} file{fileCount === 1 ? "" : "s"}
                      </div>
                      <div className="break-all font-mono text-xs text-app-muted">{id}</div>
                      <div className="text-xs text-app-muted">
                        Updated {new Date(group[group.length - 1].updated_at).toLocaleString()}
                      </div>
                      <div className="font-mono text-[11px] text-app-muted">
                        By {group[0]?.created_by ? String(group[0].created_by).slice(0, 8) + "…" : "unknown"}
                      </div>
                    </div>
                    <Link className="app-link shrink-0 text-sm" href={`/review/${group[0].id}`}>
                      Open first
                    </Link>
                  </div>
                </summary>
                <div className="mt-4 overflow-hidden rounded-xl border border-app-border bg-app-surface-muted/50">
                  <div className="divide-y divide-app-border">
                    {group.map((r: (typeof rows)[number]) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-app-primary">{r.status}</div>
                          <div className="mt-0.5 break-all font-mono text-[11px] text-app-muted">{r.id}</div>
                        </div>
                        <Link className="app-link shrink-0 text-xs" href={`/review/${r.id}`}>
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}

            {singles.map((r: (typeof rows)[number]) => (
              <div key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold text-app-text">{r.status}</div>
                  <div className="break-all font-mono text-xs text-app-muted">{r.id}</div>
                  <div className="text-xs text-app-muted">Uploaded {new Date(r.created_at).toLocaleString()}</div>
                  <div className="font-mono text-[11px] text-app-muted">
                    By {r.created_by ? String(r.created_by).slice(0, 8) + "…" : "unknown"}
                  </div>
                </div>
                <Link className="app-link shrink-0 text-sm" href={`/review/${r.id}`}>
                  Open
                </Link>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
