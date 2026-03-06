import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Link href="/" className="text-sm font-semibold text-blue-900">
              Pinamungajan HR
            </Link>

            <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-700 sm:gap-3">
              <Link className="rounded-md px-2 py-1 hover:bg-sky-100 hover:text-blue-900" href="/upload">
                Upload
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-sky-100 hover:text-blue-900" href="/review">
                Review Queue
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-sky-100 hover:text-blue-900" href="/masterlist">
                Masterlist
              </Link>
              <Link className="rounded-md px-2 py-1 hover:bg-amber-100 hover:text-amber-900" href="/settings">
                Settings
              </Link>
            </nav>
          </div>

          <div className="self-start sm:self-auto">
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              HR Department
            </div>
            <h1 className="mt-3 text-lg font-semibold text-slate-900 sm:text-xl">{title}</h1>
          </div>
        </div>
        <div className="mt-5">{children}</div>
      </main>
    </div>
  );
}
