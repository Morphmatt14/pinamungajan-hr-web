import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <AppShell title="Dashboard">
      <div className="grid gap-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Pinamungajan HR</h2>
          <p className="mt-1 text-sm text-slate-800">
            You are signed in. Choose where you want to go.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/upload" className="rounded-xl border bg-white p-4 shadow-sm hover:bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">Upload</div>
            <div className="mt-1 text-xs text-slate-800">Add scanned photos/PDFs to the system.</div>
          </Link>
          <Link href="/review" className="rounded-xl border bg-white p-4 shadow-sm hover:bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">Review Queue</div>
            <div className="mt-1 text-xs text-slate-800">Run OCR and review extracted data.</div>
          </Link>
          <Link href="/masterlist" className="rounded-xl border bg-white p-4 shadow-sm hover:bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">Masterlist</div>
            <div className="mt-1 text-xs text-slate-800">View employees linked to documents.</div>
          </Link>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Guides</div>
          <div className="mt-1 text-xs text-slate-800">Blank PDS template (for correct scanning/format)</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <a
              className="rounded-lg border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf"
              target="_blank"
              rel="noreferrer"
            >
              PDS Guide 1 (PDF)
            </a>
            <a
              className="rounded-lg border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet2.pdf"
              target="_blank"
              rel="noreferrer"
            >
              PDS Guide 2 (PDF)
            </a>
            <a
              className="rounded-lg border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet3.pdf"
              target="_blank"
              rel="noreferrer"
            >
              PDS Guide 3 (PDF)
            </a>
            <a
              className="rounded-lg border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet4.pdf"
              target="_blank"
              rel="noreferrer"
            >
              PDS Guide 4 (PDF)
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}