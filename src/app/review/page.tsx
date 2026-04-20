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
      <AppShell title="Review queue">
        <div className="app-alert-warning text-sm">
          Only administrator accounts can open the review queue.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Review queue">
      <ReviewList />
    </AppShell>
  );
}
