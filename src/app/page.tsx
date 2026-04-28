import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  PlusCircle,
  ClipboardCheck,
  Users,
  FileText,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

export default function Home() {
  return (
    <AppShell
      title="HR dashboard"
      description="Choose a task below or use the menu at the top. Your view may differ by role (HR staff vs administrator)."
    >
      <div className="grid gap-8">
        <section className="app-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start gap-3">
            <span className="inline-flex rounded-xl bg-app-primary/12 p-2.5 text-app-primary" aria-hidden>
              <Sparkles className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-tight text-app-text sm:text-2xl">
                Welcome to Pinamungajan Human Resources
              </h2>
              <p className="app-prose-muted mt-2 max-w-2xl">
                Upload forms and appointments, review scanned data, and keep the employee masterlist up to date in one
                place.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="quick-actions-heading" className="space-y-4">
          <h2
            id="quick-actions-heading"
            className="text-sm font-semibold uppercase tracking-wider text-app-muted"
          >
            Quick start
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            <li>
              <Link
                href="/upload"
                className="app-card group flex h-full flex-col p-6 outline-none transition-all hover:border-app-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-app-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg"
              >
                <span className="mb-4 inline-flex w-fit rounded-xl bg-app-primary/12 p-3 text-app-primary transition-colors group-hover:bg-app-primary/20">
                  <PlusCircle className="h-8 w-8" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-app-text">Add document</span>
                <span className="app-prose-muted mt-2 flex-1">Upload PDS, appointments, and other files for processing.</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-app-primary">
                  Go to upload
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/review"
                className="app-card group flex h-full flex-col p-6 outline-none transition-all hover:border-app-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-app-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg"
              >
                <span className="mb-4 inline-flex w-fit rounded-xl bg-app-primary/12 p-3 text-app-primary transition-colors group-hover:bg-app-primary/20">
                  <ClipboardCheck className="h-8 w-8" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-app-text">Pending reviews</span>
                <span className="app-prose-muted mt-2 flex-1">Open the queue to verify and fix extracted data.</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-app-primary">
                  Open queue
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/masterlist"
                className="app-card group flex h-full flex-col p-6 outline-none transition-all hover:border-app-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-app-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg"
              >
                <span className="mb-4 inline-flex w-fit rounded-xl bg-app-primary/12 p-3 text-app-primary transition-colors group-hover:bg-app-primary/20">
                  <Users className="h-8 w-8" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-app-text">Masterlist</span>
                <span className="app-prose-muted mt-2 flex-1">Search people and open linked records and documents.</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-app-primary">
                  Browse list
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          </ul>
        </section>

        <section className="app-card p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-app-muted" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-app-text">Printable blank forms (CS Form 212)</h3>
              <p className="app-prose-muted mt-1 max-w-2xl">
                Official PDS pages open in a new tab. For best print quality, use the browser’s print dialog (Ctrl+P or
                Cmd+P).
              </p>
            </div>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf", label: "PDS page 1" },
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet2.pdf", label: "PDS page 2" },
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet3.pdf", label: "PDS page 3" },
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet4.pdf", label: "PDS page 4" },
            ].map((item) => (
              <li key={item.href}>
                <a
                  className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface-muted px-4 py-3 text-sm font-medium text-app-text transition-colors hover:border-app-primary/35 hover:bg-app-surface"
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-app-danger" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
