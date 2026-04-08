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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Access restricted</p>
          <p className="mt-2 text-sm opacity-90">
            This page is only for administrator accounts. Ask your Supabase project owner to set{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">app_metadata.role</code> to{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">&quot;admin&quot;</code> for your user
            (see <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">supabase-admin-role.sql</code> in
            the repo).
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-blue-700 underline dark:text-blue-400">
            Back to dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin — HR activity">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Overview of document processing and employee record changes so administrators can review HR staff work.
        </p>
        <div className="mt-6">
          <AdminActivityClient />
        </div>
      </div>
      <div className="mt-6">
        <StaffManagementClient />
      </div>
    </AppShell>
  );
}
