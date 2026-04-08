import { AppShell } from "@/components/AppShell";
import { UploadClient } from "@/app/upload/UploadClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/roles";

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAdminUser(user)) {
    return (
      <AppShell title="Upload">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Admin accounts are read/review only. Upload is restricted to HR staff accounts.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Upload">
      <UploadClient />
    </AppShell>
  );
}
