import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PlusCircle, ClipboardCheck, Users, FileText } from "lucide-react";

export default function Home() {
  return (
    <AppShell title="HR Dashboard">
      <div className="grid gap-6">
        <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-slate-900">Welcome to Pinamungajan Human Resources</h2>
          <p className="mt-2 text-base text-slate-600">
            Please select an action below to manage employee records and documents.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/upload" className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-emerald-50 p-6 shadow-sm transition-all hover:border-emerald-200 hover:bg-emerald-100 hover:shadow-md">
            <div>
              <div className="mb-4 inline-flex rounded-xl bg-emerald-100 p-3 text-emerald-600 group-hover:bg-emerald-200">
                <PlusCircle className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-emerald-950">Add Document</div>
              <div className="mt-2 pl-1 text-sm text-emerald-800 leading-relaxed">Scan or upload new Personal Data Sheets (PDS) or Appointments into the system.</div>
            </div>
          </Link>

          <Link href="/review" className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-amber-50 p-6 shadow-sm transition-all hover:border-amber-200 hover:bg-amber-100 hover:shadow-md">
            <div>
              <div className="mb-4 inline-flex rounded-xl bg-amber-100 p-3 text-amber-600 group-hover:bg-amber-200">
                <ClipboardCheck className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-amber-950">Pending Reviews</div>
              <div className="mt-2 pl-1 text-sm text-amber-800 leading-relaxed">Check and approve the data the system automatically read from the scanned documents.</div>
            </div>
          </Link>

          <Link href="/masterlist" className="group flex flex-col justify-between rounded-2xl border-2 border-transparent bg-blue-50 p-6 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-100 hover:shadow-md">
            <div>
              <div className="mb-4 inline-flex rounded-xl bg-blue-100 p-3 text-blue-600 group-hover:bg-blue-200">
                <Users className="h-8 w-8" />
              </div>
              <div className="text-xl font-bold text-blue-950">Masterlist</div>
              <div className="mt-2 pl-1 text-sm text-blue-800 leading-relaxed">Search through all registered employees and view their attached documents.</div>
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-500" />
            <h3 className="text-lg font-bold text-slate-900">Printable Blank Forms</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">Download and print these official blank forms for employees to fill out.</p>
          
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <a
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
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