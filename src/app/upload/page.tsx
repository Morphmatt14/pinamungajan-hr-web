import { AppShell } from "@/components/AppShell";
import { UploadClient } from "@/app/upload/UploadClient";

export default function UploadPage() {
  return (
    <AppShell title="Upload">
      <UploadClient />
    </AppShell>
  );
}
