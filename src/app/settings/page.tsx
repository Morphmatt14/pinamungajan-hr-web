import { AppShell } from "@/components/AppShell";
import { SettingsView } from "@/app/settings/SettingsView";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Workspace preferences and read-only org defaults. Changes to extraction rules may require an administrator."
    >
      <SettingsView />
    </AppShell>
  );
}
