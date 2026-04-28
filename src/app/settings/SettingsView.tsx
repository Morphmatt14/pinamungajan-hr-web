import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/types";
import { cookies } from "next/headers";
import { NormalizePdsToggle } from "@/app/settings/NormalizePdsToggle";

export async function SettingsView() {
  const supabase = await createSupabaseServerClient();

  const cookieStore = await cookies();
  const normCookie = cookieStore.get("pds_normalize_legal")?.value;
  const initialEnabled = normCookie === null || normCookie === undefined ? true : normCookie === "1";

  const { data, error } = await supabase
    .from("settings")
    .select(
      "id, org_slug, sg_min, sg_max, age_brackets, allow_66_plus, salary_tolerance, appointment_grace_days"
    )
    .eq("org_slug", "pinamungajan-hr")
    .single();

  if (error) {
    return (
      <div className="app-alert-danger max-w-xl" role="alert">
        <p className="font-medium text-app-text">Could not load settings</p>
        <p className="mt-1 text-sm text-app-text/90">{error.message}</p>
        <p className="mt-2 text-sm text-app-muted">If this continues, check your connection and try again in a few minutes.</p>
      </div>
    );
  }

  const s = data as SettingsRow;

  return (
    <div className="grid gap-6">
      <NormalizePdsToggle initialEnabled={initialEnabled} />
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-app-text">Defaults</h2>
        <p className="app-prose-muted mt-1 text-sm">
          Values used for validation and rules in this project. Shown for reference; editing here is not available in
          the web app yet.
        </p>
        <dl className="mt-5 grid gap-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 border-b border-app-border pb-3">
            <dt className="text-app-muted">SG range</dt>
            <dd className="font-medium text-app-text">
              {s.sg_min}–{s.sg_max}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-b border-app-border pb-3">
            <dt className="text-app-muted">Salary tolerance</dt>
            <dd className="font-medium text-app-text">{s.salary_tolerance}%</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-b border-app-border pb-3">
            <dt className="text-app-muted">Appointment grace days</dt>
            <dd className="font-medium text-app-text">{s.appointment_grace_days}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-app-muted">Allow 66+ bracket</dt>
            <dd className="font-medium text-app-text">{s.allow_66_plus ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>

      <section className="app-card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-app-text">Age brackets</h2>
        <pre className="mt-4 max-h-[260px] overflow-auto rounded-xl border border-app-border bg-app-surface-muted p-4 font-mono text-xs text-app-text">
          {JSON.stringify(s.age_brackets, null, 2)}
        </pre>
      </section>
    </div>
  );
}
