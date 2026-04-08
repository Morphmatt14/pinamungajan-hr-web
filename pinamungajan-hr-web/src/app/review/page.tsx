import { AppShell } from "@/components/AppShell";
import { ReviewList } from "@/app/review/ReviewList";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth/roles";

export default async function ReviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user)) {
    return (
      <AppShell title="Review Queue">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Only admin users can access pending reviews.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Review Queue">
      <ReviewList />
    </AppShell>
  );
}
