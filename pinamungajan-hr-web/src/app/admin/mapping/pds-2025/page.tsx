import { createSupabaseServerClient } from "@/lib/supabase/server";
import { KonvaEditorLoader } from "@/app/admin/mapping/pds-2025/KonvaEditorLoader";

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
    return <div className="p-6 text-sm text-red-700">Unauthorized</div>;
  }

  if (!isAdminOrHr(user)) {
    return <div className="p-6 text-sm text-red-700">Forbidden</div>;
  }

  return (
    <div className="p-6">
      <div className="text-lg font-semibold text-slate-900">PDS 2025 Mapping Editor (Page 1)</div>
      <div className="mt-1 text-sm text-slate-700">
        Drag/resize the boxes to match the official template. Coordinates are normalized (0..1) with TOP-LEFT origin.
      </div>
      <div className="mt-4">
        <KonvaEditorLoader />
      </div>
    </div>
  );
}
