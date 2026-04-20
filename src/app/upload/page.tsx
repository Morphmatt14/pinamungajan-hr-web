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
      <AppShell title="Upload documents">
        <div className="app-alert-warning text-sm">
          Administrator accounts are read-only here. Uploads are limited to HR staff accounts.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Upload documents">
      <UploadClient />
    </AppShell>
  );
}
