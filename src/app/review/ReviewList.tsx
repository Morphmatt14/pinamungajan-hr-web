import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExtractionRow } from "@/lib/types";

export async function ReviewList() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("extractions")
    .select("id, document_id, status, quality_score, warnings, errors, created_at, updated_at, batch_id, document_set_id")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return <div className="text-sm text-red-700">Error: {error.message}</div>;
  }

  const rows = (data || []) as (ExtractionRow & { batch_id?: string | null; document_set_id?: string | null })[];

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
    <div className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3 text-sm font-medium">Latest extractions</div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-zinc-800">No extractions yet.</div>
        ) : (
          <>
            {groups.map(({ kind, id, group, fileCount }: { kind: "document_set" | "batch"; id: string; group: typeof rows; fileCount: number }) => (
              <details key={`${kind}:${id}`} className="px-4 py-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {kind === "document_set" ? "Document set" : "Batch upload"} ({fileCount} files)
                      </div>
                      <div className="text-xs text-zinc-800 font-mono">{id}</div>
                      <div className="mt-1 text-xs text-zinc-700">Latest: {new Date(group[group.length - 1].updated_at).toLocaleString()}</div>
                    </div>
                    <Link className="text-sm underline" href={`/review/${group[0].id}`}>
                      Open first
                    </Link>
                  </div>
                </summary>
                <div className="mt-3 rounded-md border bg-white">
                  <div className="divide-y">
                    {group.map((r: (typeof rows)[number]) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{r.status}</div>
                          <div className="text-[11px] text-zinc-800 font-mono">{r.id}</div>
                        </div>
                        <Link className="text-xs underline" href={`/review/${r.id}`}>
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}

            {singles.map((r: (typeof rows)[number]) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{r.status}</div>
                  <div className="text-xs text-zinc-800 font-mono">{r.id}</div>
                  <div className="mt-1 text-xs text-zinc-700">Uploaded: {new Date(r.created_at).toLocaleString()}</div>
                </div>
                <Link className="text-sm underline" href={`/review/${r.id}`}>
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
