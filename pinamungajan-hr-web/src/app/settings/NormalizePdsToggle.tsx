"use client";

import { useState } from "react";

export function NormalizePdsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(next: boolean) {
    try {
      setSaving(true);
      setErr(null);
      const res = await fetch("/api/settings/pds-normalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      setEnabled(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-medium">PDS export</div>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span>Normalize PDS to 8.5×13 on export</span>
        </label>
        <div className="text-xs text-slate-700">Applies only when the upload is detected as CS Form 212 (PDS).</div>
        {err ? <div className="text-xs text-red-700">{err}</div> : null}
      </div>
    </div>
  );
}
