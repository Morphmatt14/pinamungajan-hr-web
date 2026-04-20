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
    <section className="app-card p-5 sm:p-6">
      <h2 className="text-base font-semibold text-app-text">PDS export</h2>
      <p className="app-prose-muted mt-1">Controls how printable PDS output is sized when the file is detected as CS Form 212.</p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-app-border bg-app-surface-muted/80 p-4 transition-colors hover:bg-app-surface-muted">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-app-border text-app-primary focus:ring-app-ring"
          checked={enabled}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="text-sm text-app-text">
          <span className="font-medium">Normalize PDS to 8.5×13 on export</span>
          {saving ? <span className="mt-1 block text-xs text-app-muted">Saving…</span> : null}
        </span>
      </label>
      {err ? <div className="app-alert-danger mt-3 text-xs">{err}</div> : null}
    </section>
  );
}
