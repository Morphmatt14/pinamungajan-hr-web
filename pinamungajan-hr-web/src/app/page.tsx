import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PlusCircle, ClipboardCheck, Users, FileText } from "lucide-react";

export default function Home() {
  return (
    <AppShell title="HR Dashboard">
      <div className="grid gap-6">
        <div className="rounded-2xl border border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8 transition-colors">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome to Pinamungajan Human Resources</h2>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
            Please select an action below to manage employee records and documents.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/upload" className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-emerald-50 dark:bg-emerald-950/30 p-6 shadow-sm transition-all hover:border-emerald-200 dark:hover:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:shadow-md">
            <div>
              <div className="mb-4 inline-flex rounded-xl bg-emerald-100 dark:bg-emerald-900 p-3 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800 transition-colors">
                <PlusCircle className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-emerald-950 dark:text-emerald-100">Add Document</div>
              <div className="mt-2 pl-1 text-sm text-emerald-800 dark:text-emerald-400 leading-relaxed">Scan or upload new Personal Data Sheets (PDS) or Appointments into the system.</div>
            </div>
          </Link>

          <Link href="/review" className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-amber-50 dark:bg-amber-950/30 p-6 shadow-sm transition-all hover:border-amber-200 dark:hover:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:shadow-md">
            <div>
              <div className="mb-4 inline-flex rounded-xl bg-amber-100 dark:bg-amber-900 p-3 text-amber-600 dark:text-amber-400 group-hover:bg-amber-200 dark:group-hover:bg-amber-800 transition-colors">
                <ClipboardCheck className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-amber-950 dark:text-amber-100">Pending Reviews</div>
              <div className="mt-2 pl-1 text-sm text-amber-800 dark:text-amber-400 leading-relaxed">Check and approve the data the system automatically read from the scanned documents.</div>
            </div>
          </Link>

          <Link href="/masterlist" className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-blue-50 dark:bg-blue-950/30 p-6 shadow-sm transition-all hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:shadow-md">
            <div>
              <div className="mb-4 inline-flex rounded-xl bg-blue-100 dark:bg-blue-900 p-3 text-blue-600 dark:text-blue-400 group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                <Users className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-blue-950 dark:text-blue-100">Masterlist</div>
              <div className="mt-2 pl-1 text-sm text-blue-800 dark:text-blue-400 leading-relaxed">Search through all registered employees and view their attached documents.</div>
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8 transition-colors">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Printable Blank Forms</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Download and print these official blank forms for employees to fill out.</p>
          
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf"
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="h-4 w-4 text-red-500" />
              PDS Page 1
            </a>
            <a
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet2.pdf"
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="h-4 w-4 text-red-500" />
              PDS Page 2
            </a>
            <a
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet3.pdf"
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="h-4 w-4 text-red-500" />
              PDS Page 3
            </a>
            <a
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
              href="/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet4.pdf"
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="h-4 w-4 text-red-500" />
              PDS Page 4
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}