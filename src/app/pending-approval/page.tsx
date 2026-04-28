import { AppShell } from "@/components/AppShell";
import { Clock, Mail, Shield } from "lucide-react";

export default function PendingApprovalPage() {
  return (
    <AppShell
      title="We’re almost ready for you"
      description="Your account is set up, but a quick approval step is still needed before you can use the system."
    >
      <div className="app-card max-w-2xl space-y-6 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-app-warning/15 text-app-warning">
            <Clock className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-app-text">Waiting for administrator approval</h2>
            <p className="app-prose-muted mt-2">
              You can sign in, but access to HR features stays paused until an administrator approves your account in
              the system.
            </p>
          </div>
        </div>

        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-app-text">
          <li>Contact your HR or IT point person if you are unsure who approves new users.</li>
          <li>Ask them to open Admin → staff management and approve your email address.</li>
          <li>Refresh this page or sign out and back in after they approve you.</li>
        </ol>

        <div className="app-alert-info flex items-start gap-3 text-left">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-app-primary" aria-hidden />
          <p className="text-sm">
            <span className="font-medium text-app-text">Tip: </span>
            If your office uses a shared admin, mention that you are waiting on{" "}
            <span className="font-medium">HR staff</span> access.
          </p>
        </div>

        <p className="flex items-center gap-2 text-xs text-app-muted">
          <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Only authorized administrators can change approval status. This page updates automatically when you are
          approved.
        </p>
      </div>
    </AppShell>
  );
}
