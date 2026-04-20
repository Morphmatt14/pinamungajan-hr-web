import { AppShell } from "@/components/AppShell";
import { MasterlistClient } from "@/app/masterlist/MasterlistClient";

export const dynamic = "force-dynamic";

export default function MasterlistPage() {
  return (
    <AppShell title="Employee masterlist">
      <MasterlistClient />
    </AppShell>
  );
}
