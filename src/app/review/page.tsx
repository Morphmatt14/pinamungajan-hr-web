import { AppShell } from "@/components/AppShell";
import { ReviewList } from "@/app/review/ReviewList";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return (
      <AppShell
        title="Review queue"
        description="Reserved for administrator accounts. HR staff can upload documents; admins review the queue here."
      >
        <div className="app-card max-w-2xl space-y-3 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-app-text">Administrators only</h2>
          <p className="app-prose-muted text-sm leading-relaxed">
            The review queue lists extractions that need a final check. If you are HR staff, ask an administrator to
            process reviews, or use <strong>Upload</strong> and <strong>Masterlist</strong> in the menu.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Review queue"
      description="Open a row to see extracted fields, run OCR, and commit updates to the masterlist when ready."
    >
      <ReviewList />
    </AppShell>
  );
}
