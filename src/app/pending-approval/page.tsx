import { AppShell } from "@/components/AppShell";

export default function PendingApprovalPage() {
  return (
    <AppShell title="Account pending approval">
      <div className="app-alert-warning max-w-2xl space-y-3">
        <p className="text-base font-semibold text-app-text">Waiting for administrator approval</p>
        <p className="text-sm leading-relaxed">
          Your account was created successfully, but access is blocked until an administrator approves it.
        </p>
        <p className="text-sm leading-relaxed text-app-muted">
          Contact your HR administrator and ask them to approve your email in Admin → HR staff.
        </p>
      </div>
    </AppShell>
  );
}
