import { AppShell } from "@/components/AppShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/roles";
import { AdminActivityClient } from "@/app/admin/AdminActivityClient";
import { StaffManagementClient } from "@/app/admin/StaffManagementClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: userFromGetUser },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = userFromGetUser ?? session?.user ?? null;

  if (!user || !isAdminUser(user)) {
    return (
      <AppShell
        title="Admin"
        description="This area is limited to users with the administrator role."
      >
        <div className="app-card max-w-2xl space-y-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-app-text">You don’t have access yet</h2>
          <p className="text-sm leading-relaxed text-app-muted">
            This page is for accounts with the <span className="font-medium text-app-text">administrator</span> role.
            Ask your Supabase project owner to set{" "}
            <code className="rounded-md bg-app-surface-muted px-1.5 py-0.5 font-mono text-xs text-app-text">
              app_metadata.role
            </code>{" "}
            to <code className="rounded-md bg-app-surface-muted px-1.5 py-0.5 font-mono text-xs text-app-text">&quot;admin&quot;</code> for your user, or
            use the <code className="font-mono text-xs">supabase-admin-role.sql</code> and setup script in the repo.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-app-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-app-ring/40"
          >
            ← Back to dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Administration"
      description="Monitor activity, manage HR staff accounts, and review what changed in the system."
    >
      <div className="app-card p-6 sm:p-8">
        <p className="app-prose-muted max-w-3xl">
          Use the sections below to see document processing and employee record updates, and to add or adjust HR staff
          access.
        </p>
        <div className="mt-8">
          <AdminActivityClient />
        </div>
      </div>
      <div className="mt-8">
        <StaffManagementClient />
      </div>
    </AppShell>
  );
}
