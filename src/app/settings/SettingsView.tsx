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
    return <div className="text-sm text-red-700">Error: {error.message}</div>;
  }

  const s = data as SettingsRow;

  return (
    <div className="grid gap-4">
      <NormalizePdsToggle initialEnabled={initialEnabled} />
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">Defaults</div>
        <div className="mt-2 grid gap-2 text-sm">
          <div>
            <span className="font-medium">SG range:</span> {s.sg_min}–{s.sg_max}
          </div>
          <div>
            <span className="font-medium">Salary tolerance:</span> {s.salary_tolerance}%
          </div>
          <div>
            <span className="font-medium">Appointment grace days:</span> {s.appointment_grace_days}
          </div>
          <div>
            <span className="font-medium">Allow 66+ bracket:</span> {s.allow_66_plus ? "ON" : "OFF"}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium">Age brackets</div>
        <pre className="mt-2 max-h-[260px] overflow-auto rounded bg-zinc-50 p-3 text-xs">
          {JSON.stringify(s.age_brackets, null, 2)}
        </pre>
      </div>
    </div>
  );
}
