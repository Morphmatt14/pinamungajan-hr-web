"use client";

import dynamic from "next/dynamic";

const KonvaMappingEditorClient = dynamic(
  () => import("@/app/admin/mapping/pds-2025/KonvaMappingEditorV2Client").then((m) => m.KonvaMappingEditorV2Client),
  {
    ssr: false,
    loading: () => <div className="text-sm text-slate-700">Loading editor…</div>,
  }
);

export function KonvaEditorLoader() {
  return <KonvaMappingEditorClient />;
}
