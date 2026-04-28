import { createSupabaseServerClient } from "@/lib/supabase/server";
import { KonvaEditorLoader } from "@/app/admin/mapping/pds-2025/KonvaEditorLoader";

/** Auth + Supabase; must not run at build time without env (e.g. Vercel before vars are set). */
export const dynamic = "force-dynamic";

function isAdminOrHr(user: any) {
  const role = String(user?.app_metadata?.role || "").toLowerCase();
  return role === "admin" || role === "hr";
}

export default async function Pds2025MappingEditorPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-app-bg p-6">
        <div className="app-alert-danger max-w-md" role="alert">
          <p className="font-medium">You need to sign in</p>
          <p className="mt-1 text-sm">Open the HR app and sign in, then return to this page.</p>
        </div>
      </div>
    );
  }

  if (!isAdminOrHr(user)) {
    return (
      <div className="min-h-screen bg-app-bg p-6">
        <div className="app-alert-warning max-w-md">
          <p className="font-medium text-app-text">Access restricted</p>
          <p className="mt-1 text-sm text-app-muted">Only admin or HR accounts can use the mapping editor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg p-4 sm:p-6">
      <div className="app-card mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="text-lg font-semibold text-app-text sm:text-xl">PDS 2025 mapping (page 1)</h1>
        <p className="app-prose-muted mt-2 text-sm">
          Drag and resize the boxes to line up with the official template. Coordinates are saved as 0…1 from the
          <span className="whitespace-nowrap"> top-left </span>
          corner.
        </p>
        <div className="mt-6">
          <KonvaEditorLoader />
        </div>
      </div>
    </div>
  );
}
