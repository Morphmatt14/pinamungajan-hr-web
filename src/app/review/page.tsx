import { AppShell } from "@/components/AppShell";
import { ReviewList } from "@/app/review/ReviewList";

export default function ReviewPage() {
  return (
    <AppShell title="Review Queue">
      <ReviewList />
    </AppShell>
  );
}
