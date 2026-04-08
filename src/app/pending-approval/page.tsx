import { AppShell } from "@/components/AppShell";

export default function PendingApprovalPage() {
  return (
    <AppShell title="Account Pending Approval">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="text-lg font-semibold">Waiting for admin approval</p>
        <p className="mt-2 text-sm">
          Your account was created successfully, but access is blocked until an admin approves your account.
        </p>
        <p className="mt-3 text-sm">
          Please contact your HR administrator to approve your email in the Admin &gt; HR staff panel.
        </p>
      </div>
    </AppShell>
  );
}

