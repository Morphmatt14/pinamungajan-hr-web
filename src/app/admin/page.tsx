import { AppShell } from "@/components/AppShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/roles";
import { AdminActivityClient } from "@/app/admin/AdminActivityClient";
import { StaffManagementClient } from "@/app/admin/StaffManagementClient";
import Link from "next/link";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return (
      <AppShell title="Admin">
        <div className="app-alert-warning max-w-2xl space-y-3">
          <p className="font-semibold text-app-text">Access restricted</p>
          <p className="text-sm leading-relaxed text-app-muted">
            This page is only for administrator accounts. Ask your Supabase project owner to set{" "}
            <code className="rounded-md bg-app-surface-muted px-1.5 py-0.5 font-mono text-xs text-app-text">
              app_metadata.role
            </code>{" "}
            to{" "}
            <code className="rounded-md bg-app-surface-muted px-1.5 py-0.5 font-mono text-xs text-app-text">
              &quot;admin&quot;
            </code>{" "}
            for your user (see <code className="font-mono text-xs">supabase-admin-role.sql</code> in the repo).
          </p>
          <Link href="/" className="app-link inline-block text-sm">
            ← Back to dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Administration">
      <div className="app-card p-6 sm:p-8">
        <p className="app-prose-muted max-w-3xl">
          Overview of document processing and employee record changes so administrators can review HR staff activity.
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
