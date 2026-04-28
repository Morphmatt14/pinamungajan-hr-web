import { AppShell } from "@/components/AppShell";
import { UploadClient } from "@/app/upload/UploadClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAdminUser(user)) {
    return (
      <AppShell
        title="Upload documents"
        description="This step is for HR staff who add new files. Your administrator account can review activity from the Admin area instead."
      >
        <div className="app-card max-w-2xl space-y-4 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-app-text">Uploads are for HR staff</h2>
          <p className="app-prose-muted text-sm leading-relaxed">
            Administrator accounts are intentionally blocked from upload so daily intake stays on designated HR
            accounts. Use <strong>Reviews</strong> and <strong>Admin</strong> from the top menu to monitor work.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Upload documents"
      description="Add PDFs or images of PDS forms, appointments, and other HR documents. We’ll run extraction after upload."
    >
      <UploadClient />
    </AppShell>
  );
}
