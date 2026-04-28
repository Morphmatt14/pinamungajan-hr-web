import { AppShell } from "@/components/AppShell";
import { MasterlistClient } from "@/app/masterlist/MasterlistClient";

export const dynamic = "force-dynamic";

export default function MasterlistPage() {
  return (
    <AppShell
      title="Employee masterlist"
      description="Search and open employee records. Use filters in the list to find people quickly."
    >
      <MasterlistClient />
    </AppShell>
  );
}
