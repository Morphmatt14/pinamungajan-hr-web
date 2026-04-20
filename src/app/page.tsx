import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PlusCircle, ClipboardCheck, Users, FileText, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <AppShell title="HR dashboard">
      <div className="grid gap-8">
        <section className="app-card p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-app-text sm:text-2xl">
            Welcome to Pinamungajan Human Resources
          </h2>
          <p className="app-prose-muted mt-2 max-w-2xl">
            Upload documents, review extracted data, and maintain the employee masterlist from one place.
          </p>
        </section>

        <section aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading" className="sr-only">
            Quick actions
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            <li>
              <Link
                href="/upload"
                className="app-card group flex h-full flex-col p-6 transition-all hover:border-app-primary/40 hover:shadow-md"
              >
                <span className="mb-4 inline-flex rounded-xl bg-app-primary/12 p-3 text-app-primary transition-colors group-hover:bg-app-primary/20">
                  <PlusCircle className="h-8 w-8" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-app-text">Add document</span>
                <span className="app-prose-muted mt-2 flex-1">
                  Upload PDS, appointments, and other HR files for processing.
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-app-primary">
                  Go to upload <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/review"
                className="app-card group flex h-full flex-col p-6 transition-all hover:border-app-primary/40 hover:shadow-md"
              >
                <span className="mb-4 inline-flex rounded-xl bg-app-primary/12 p-3 text-app-primary transition-colors group-hover:bg-app-primary/20">
                  <ClipboardCheck className="h-8 w-8" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-app-text">Pending reviews</span>
                <span className="app-prose-muted mt-2 flex-1">
                  Open the queue to verify and approve extracted information.
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-app-primary">
                  Open queue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/masterlist"
                className="app-card group flex h-full flex-col p-6 transition-all hover:border-app-primary/40 hover:shadow-md"
              >
                <span className="mb-4 inline-flex rounded-xl bg-app-primary/12 p-3 text-app-primary transition-colors group-hover:bg-app-primary/20">
                  <Users className="h-8 w-8" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-app-text">Masterlist</span>
                <span className="app-prose-muted mt-2 flex-1">
                  Search employees and view linked documents and records.
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-app-primary">
                  Browse list <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          </ul>
        </section>

        <section className="app-card p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-app-muted" aria-hidden />
            <h3 className="text-base font-semibold text-app-text">Printable blank forms</h3>
          </div>
          <p className="app-prose-muted mt-1">Official CS Form 212 (PDS) PDFs for printing.</p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf", label: "PDS page 1" },
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet2.pdf", label: "PDS page 2" },
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet3.pdf", label: "PDS page 3" },
              { href: "/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet4.pdf", label: "PDS page 4" },
            ].map((item) => (
              <li key={item.href}>
                <a
                  className="flex items-center gap-2 rounded-xl border border-app-border bg-app-surface-muted px-4 py-3 text-sm font-medium text-app-text transition-colors hover:border-app-primary/35 hover:bg-app-surface"
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="h-4 w-4 shrink-0 text-app-danger" aria-hidden />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
