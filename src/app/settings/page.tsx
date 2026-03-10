import { AppShell } from "@/components/AppShell";
import { SettingsView } from "@/app/settings/SettingsView";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <SettingsView />
    </AppShell>
  );
}
