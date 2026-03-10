"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Image as KonvaImage, Transformer, Text as KonvaText, Line } from "react-konva";
import type Konva from "konva";
import { fitTextInBox, type FitStyle } from "@/lib/pds/fontFit";
import {
  type FieldDef,
  type FieldStyle,
  type FieldType,
  type MapJsonV2,
  type NormBox,
  applyGlobal,
  invertGlobal,
  sanitizeBox,
} from "@/lib/pds2025/mappingSchema";

const DEFAULT_STYLE: FieldStyle = {
  paddingPx: 2,
  alignX: "left",
  alignY: "middle",
  maxFontSize: 11,
  minFontSize: 6,
  singleLine: true,
};

function styleForField(map: MapJsonV2, id: string): FieldStyle {
  const s = (map.styles?.[id] ?? {}) as Partial<FieldStyle>;
  return {
    paddingPx: Number.isFinite(s.paddingPx) ? Number(s.paddingPx) : DEFAULT_STYLE.paddingPx,
    alignX: s.alignX === "center" || s.alignX === "right" ? s.alignX : DEFAULT_STYLE.alignX,
    alignY: s.alignY === "top" || s.alignY === "bottom" ? s.alignY : DEFAULT_STYLE.alignY,
    maxFontSize: Number.isFinite(s.maxFontSize) ? Number(s.maxFontSize) : DEFAULT_STYLE.maxFontSize,
    minFontSize: Number.isFinite(s.minFontSize) ? Number(s.minFontSize) : DEFAULT_STYLE.minFontSize,
    singleLine: typeof s.singleLine === "boolean" ? s.singleLine : DEFAULT_STYLE.singleLine,
  };
}

function useHtmlImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setImg(null);
      setError(null);
      return;
    }

    const i = new window.Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      setImg(i);
      setError(null);
    };
    i.onerror = () => {
      setImg(null);
      setError(`Template image failed to load: ${src}. Generate it with: npm run pds:png -- --page N`);
    };
    i.src = src;
  }, [src]);

  return { img, error };
}

function makeCanvasMeasurer() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  return {
    measure: (fontFamily: string, fontSize: number, text: string) => {
      if (!ctx) return 0;
      ctx.font = `${fontSize}px ${fontFamily}`;
      return ctx.measureText(text).width;
    },
  };
}

function snapPx(n: number, enabled: boolean, gridSizePx: number) {
  if (!enabled) return n;
  const g = Math.max(1, gridSizePx);
  return Math.round(n / g) * g;
}

function applySnapToPxRect(
  r: { x: number; y: number; w: number; h: number },
  enabled: boolean,
  gridSizePx: number
) {
  return {
    x: snapPx(r.x, enabled, gridSizePx),
    y: snapPx(r.y, enabled, gridSizePx),
    w: snapPx(r.w, enabled, gridSizePx),
    h: snapPx(r.h, enabled, gridSizePx),
  };
}

function isMapV2(mj: any): mj is MapJsonV2 {
  return mj && typeof mj === "object" && mj.schema_version === 2 && Array.isArray(mj.fields);
}

function defaultMapV2(templateVersion: string, page: number): MapJsonV2 {
  return {
    schema_version: 2,
    template_version: templateVersion,
    page,
    transform: { sx: 1, sy: 1, dx: 0, dy: 0 },
    fields: [],
    styles: {},
  };
}

function normalizeFieldColor(type: FieldType) {
  if (type === "checkbox") return "#2563eb";
  if (type === "table") return "#7c3aed";
  if (type === "photo" || type === "signature" || type === "thumbmark") return "#0f172a";
  return "#dc2626";
}

function labelPlaceholderForType(type: FieldType) {
  if (type === "date") return "Example: DATE OF BIRTH (dd/mm/yyyy)";
  if (type === "checkbox") return "Example: SEX AT BIRTH";
  if (type === "table") return "Example: CHILDREN (name | dob | …)";
  if (type === "photo") return "Example: PHOTO";
  if (type === "signature") return "Example: SIGNATURE";
  if (type === "thumbmark") return "Example: THUMBMARK";
  return "Example: SURNAME";
}

function previewSampleForField(f: FieldDef) {
  if (f.type === "date") return "31/12/2000";
  if (f.type === "checkbox") return "X";
  if (f.type === "photo") return "[PHOTO]";
  if (f.type === "signature") return "[SIGNATURE]";
  if (f.type === "thumbmark") return "[THUMBMARK]";
  if (f.type === "table") return "[TABLE]";
  return String(f.label || f.id);
}

function makeNewField(page: number): FieldDef {
  return {
    id: `field_${Date.now()}`,
    label: "",
    page,
    type: "text",
    box: { x: 0.1, y: 0.1, w: 0.2, h: 0.03 },
    options: { kind: "text" },
  };
}

export function KonvaMappingEditorV2Client() {
  const templateVersion = "2025";

  const [page, setPage] = useState(1);
  const templatePngUrl = `/templates/pds-2025-page${page}.png`;
  const { img, error: imgError } = useHtmlImage(templatePngUrl);

  const [templateSize, setTemplateSize] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [saveOkAt, setSaveOkAt] = useState<number | null>(null);

  const [map, setMap] = useState<MapJsonV2 | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string>("");
  const [previewFill, setPreviewFill] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSizePx, setGridSizePx] = useState(10);
  const [guides, setGuides] = useState<{ x?: number; y?: number } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  const measurer = useMemo(() => (typeof document !== "undefined" ? makeCanvasMeasurer() : null), []);

  useEffect(() => {
    if (!img) return;
    const w = Number(img.naturalWidth || 0);
    const h = Number(img.naturalHeight || 0);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    setTemplateSize({ w, h });
  }, [img]);

  const stageSize = useMemo(() => templateSize ?? { w: 700, h: 900 }, [templateSize]);

  const draftKey = useMemo(() => `pds_map_draft_${templateVersion}_page_${page}`, [templateVersion, page]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setLoadWarning(null);
        setSaveOkAt(null);
        setSelectedId(null);
        trRef.current?.nodes([]);
        trRef.current?.getLayer()?.batchDraw();

        const res = await fetch(`/api/pds/map?template=${templateVersion}&page=${page}`, { credentials: "include" });
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || res.statusText);
        const j = JSON.parse(txt);

        if (typeof j?.warning === "string") setLoadWarning(j.warning);

        let mj: any = j?.map_json ?? null;
        const localDraftRaw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
        const localDraft = localDraftRaw ? (() => {
          try {
            return JSON.parse(localDraftRaw);
          } catch {
            return null;
          }
        })() : null;

        // Priority:
        // 1) DB map_json if valid
        // 2) local draft if DB missing/invalid
        // 3) default empty
        if (!isMapV2(mj)) {
          mj = isMapV2(localDraft) ? localDraft : defaultMapV2(templateVersion, page);
        }

        // Keep these consistent in case a draft was loaded.
        mj = { ...mj, template_version: templateVersion, page };

        if (!cancelled) setMap(mj);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  // Auto-backup draft map locally so a failed save doesn't lose work.
  useEffect(() => {
    if (!map) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(map));
    } catch {
      // ignore localStorage errors (quota, private mode, etc.)
    }
  }, [map, draftKey]);

  // Keep transformer attached.
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    const stage = stageRef.current;

    if (!selectedId) {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
      return;
    }

    // Don't use CSS selector style queries (findOne('#...')) because field IDs might contain
    // special characters (e.g. '.', spaces) that break selector parsing.
    const targetNodeId = `box-${selectedId}`;
    const node = stage.find((n: Konva.Node) => n.id() === targetNodeId)?.[0];
    if (!node) {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
      return;
    }

    trRef.current.nodes([node as any]);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedId, map]);

  useEffect(() => {
    return () => {
      trRef.current?.nodes([]);
    };
  }, []);

  // Keep a local draft for editing stable IDs without losing focus.
  useEffect(() => {
    if (!map || !selectedId) {
      setDraftId("");
      return;
    }
    const f = map.fields.find((x) => x.id === selectedId);
    setDraftId(f?.id ?? "");
  }, [selectedId, map]);

  // Arrow key nudge.
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (!map || !selectedId) return;
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;

      const step = ev.shiftKey ? 5 : 1;
      const dxPx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
      const dyPx = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;

      setMap((prev) => {
        if (!prev) return prev;
        const idx = prev.fields.findIndex((f) => f.id === selectedId);
        if (idx < 0) return prev;

        const f = prev.fields[idx];
        const active = applyGlobal(f.box, prev.transform);
        const nextActive = sanitizeBox({
          ...active,
          x: active.x + dxPx / stageSize.w,
          y: active.y + dyPx / stageSize.h,
        });
        const inv = invertGlobal(nextActive, prev.transform);

        const nextFields = prev.fields.slice();
        nextFields[idx] = { ...f, box: inv };
        return { ...prev, fields: nextFields };
      });

      ev.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [map, selectedId, stageSize.w, stageSize.h]);

  async function save() {
    if (!map) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/pds/map`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ template_version: templateVersion, page, map_json: map }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);

      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      setSaveOkAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function updateTransform(patch: Partial<MapJsonV2["transform"]>) {
    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, transform: { ...prev.transform, ...patch } };
    });
  }

  function updateStyle(fieldId: string, patch: Partial<FieldStyle>) {
    setMap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        styles: {
          ...(prev.styles || {}),
          [fieldId]: {
            ...styleForField(prev, fieldId),
            ...patch,
          },
        },
      };
    });
  }

  function updateField(fieldId: string, patch: Partial<FieldDef>) {
    setMap((prev) => {
      if (!prev) return prev;
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx < 0) return prev;
      const nextFields = prev.fields.slice();
      nextFields[idx] = { ...nextFields[idx], ...patch } as any;
      return { ...prev, fields: nextFields };
    });
  }

  function commitRenameFieldId(currentId: string, nextIdRaw: string) {
    const nextId = String(nextIdRaw || "").trim();
    if (!nextId || nextId === currentId) return;
    setMap((prev) => {
      if (!prev) return prev;
      if (prev.fields.some((f) => f.id === nextId)) return prev;
      const idx = prev.fields.findIndex((f) => f.id === currentId);
      if (idx < 0) return prev;
      const nextFields = prev.fields.slice();
      nextFields[idx] = { ...nextFields[idx], id: nextId };
      const nextStyles = { ...(prev.styles || {}) };
      if (nextStyles[currentId]) {
        nextStyles[nextId] = nextStyles[currentId];
        delete nextStyles[currentId];
      }
      return { ...prev, fields: nextFields, styles: nextStyles };
    });
    setSelectedId(nextId);
  }

  function setActiveBox(fieldId: string, nextActive: NormBox) {
    setMap((prev) => {
      if (!prev) return prev;
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx < 0) return prev;
      const f = prev.fields[idx];

      const nextPxRaw = {
        x: nextActive.x * stageSize.w,
        y: nextActive.y * stageSize.h,
        w: nextActive.w * stageSize.w,
        h: nextActive.h * stageSize.h,
      };

      const snapped = applySnapToPxRect(nextPxRaw, snapToGrid, gridSizePx);

      const nextPx = {
        x: snapped.x / stageSize.w,
        y: snapped.y / stageSize.h,
        w: snapped.w / stageSize.w,
        h: snapped.h / stageSize.h,
      };

      const inv = invertGlobal(sanitizeBox(nextPx), prev.transform);

      const nextFields = prev.fields.slice();
      nextFields[idx] = { ...f, box: inv };
      return { ...prev, fields: nextFields };
    });
  }

  function addField() {
    setMap((prev) => {
      if (!prev) return prev;
      const f = makeNewField(page);
      return { ...prev, fields: [...prev.fields, f] };
    });
  }

  function deleteSelected() {
    if (!selectedId) return;
    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, fields: prev.fields.filter((f) => f.id !== selectedId) };
    });
    setSelectedId(null);
  }

  if (loading) return <div className="text-sm text-slate-700">Loading…</div>;
  if (error) return <div className="text-sm text-red-700">Error: {error}</div>;
  if (!map) return <div className="text-sm text-red-700">No map loaded</div>;
  if (!templateSize) {
    return <div className="text-sm text-slate-700">Loading template image…{imgError ? ` (${imgError})` : ""}</div>;
  }

  const fieldsOnPage = map.fields.filter((f) => f.page === page);

  const selected = selectedId ? map.fields.find((f) => f.id === selectedId) : null;
  const selectedActive = selected ? applyGlobal(selected.box, map.transform) : null;
  const st = selected ? styleForField(map, selected.id) : null;
  const labelPlaceholder = selected ? labelPlaceholderForType(selected.type) : "Example: SURNAME";

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                page === p ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-300 bg-white text-slate-900"
              }`}
            >
              Page {p}
            </button>
          ))}
        </div>

        {loadWarning ? <div className="mt-2 text-xs text-amber-700">Load warning: {loadWarning}</div> : null}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={addField}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-50"
          >
            Add field
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={!selectedId}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            Delete selected
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {saveOkAt ? <div className="mt-2 text-xs text-emerald-700">Saved.</div> : null}
        {error ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            Save/load error: {error}
          </div>
        ) : null}

        <div className="mt-4 text-sm font-semibold text-slate-900">Fields (page {page})</div>
        <div className="mt-2 max-h-[260px] overflow-auto rounded-md border">
          {fieldsOnPage.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-600">No fields on this page yet.</div>
          ) : (
            <div className="grid">
              {fieldsOnPage.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`border-b px-3 py-2 text-left text-xs ${
                    selectedId === f.id ? "bg-blue-50 text-blue-900" : "bg-white text-slate-900"
                  }`}
                >
                  <div className="font-semibold">{String(f.label || f.id)}</div>
                  <div className="text-[11px] text-slate-600">type: {f.type}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-sm font-semibold text-slate-900">Properties</div>
        {!selected || !selectedActive || !st ? (
          <div className="mt-2 text-xs text-slate-600">Select a field box to edit properties.</div>
        ) : (
          <div className="mt-2 grid gap-2">
            <TextField
              label="Label (shown on box)"
              value={String(selected.label || "")}
              onChange={(v) => updateField(selected.id, { label: v })}
              placeholder={labelPlaceholder}
            />
            <TextField
              label="Field ID (system, stable)"
              value={draftId}
              onChange={(v) => setDraftId(v)}
              onBlur={() => commitRenameFieldId(selected.id, draftId)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRenameFieldId(selected.id, draftId);
              }}
            />
            <Select
              label="type"
              value={selected.type}
              options={["text", "date", "checkbox", "table", "photo", "signature", "thumbmark"]}
              onChange={(v) => {
                const t = v as FieldType;
                const options: any =
                  t === "date"
                    ? { kind: "date", format: "dd/mm/yyyy" }
                    : t === "checkbox"
                      ? { kind: "checkbox", choices: [] }
                      : t === "table"
                        ? {
                            kind: "table",
                            table: {
                              startY: selected.box.y,
                              rowHeight: 0.03,
                              maxRows: 10,
                              columns: [],
                            },
                          }
                        : t === "photo"
                          ? { kind: "photo" }
                          : t === "signature"
                            ? { kind: "signature" }
                            : t === "thumbmark"
                              ? { kind: "thumbmark" }
                              : { kind: "text" };
                updateField(selected.id, { type: t, options });
              }}
            />

            <div className="grid grid-cols-4 gap-2 text-xs">
              <NumField label="x" value={selectedActive.x} onChange={(v) => setActiveBox(selected.id, { ...selectedActive, x: v })} />
              <NumField label="y" value={selectedActive.y} onChange={(v) => setActiveBox(selected.id, { ...selectedActive, y: v })} />
              <NumField label="w" value={selectedActive.w} onChange={(v) => setActiveBox(selected.id, { ...selectedActive, w: v })} />
              <NumField label="h" value={selectedActive.h} onChange={(v) => setActiveBox(selected.id, { ...selectedActive, h: v })} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <NumField label="fontMin" value={st.minFontSize} onChange={(v) => updateStyle(selected.id, { minFontSize: v })} />
              <NumField label="fontMax" value={st.maxFontSize} onChange={(v) => updateStyle(selected.id, { maxFontSize: v })} />
              <NumField label="padding" value={st.paddingPx} onChange={(v) => updateStyle(selected.id, { paddingPx: v })} />
              <Toggle label="singleLine" value={st.singleLine} onChange={(v) => updateStyle(selected.id, { singleLine: v })} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Select label="alignX" value={st.alignX} options={["left", "center", "right"]} onChange={(v) => updateStyle(selected.id, { alignX: v as any })} />
              <Select label="alignY" value={st.alignY} options={["top", "middle", "bottom"]} onChange={(v) => updateStyle(selected.id, { alignY: v as any })} />
            </div>

            <div className="mt-2 rounded-lg border bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-slate-900">Global transform</div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                <NumField label="sx" value={map.transform.sx} onChange={(v) => updateTransform({ sx: v })} />
                <NumField label="sy" value={map.transform.sy} onChange={(v) => updateTransform({ sy: v })} />
                <NumField label="dx" value={map.transform.dx} onChange={(v) => updateTransform({ dx: v })} />
                <NumField label="dy" value={map.transform.dy} onChange={(v) => updateTransform({ dy: v })} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Toggle label="preview" value={previewFill} onChange={setPreviewFill} />
              <Toggle label="grid" value={showGrid} onChange={setShowGrid} />
              <Toggle label="snap" value={snapToGrid} onChange={setSnapToGrid} />
              <NumField label="gridPx" value={gridSizePx} onChange={(v) => setGridSizePx(Math.max(1, Math.round(v)))} />
            </div>
          </div>
        )}

        {imgError ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{imgError}</div> : null}
      </div>

      <div className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-700">
          Tip: click a box to select. Drag to move. Use handles to resize. Arrow keys nudge (Shift = bigger).
        </div>

        <div className="mt-3 overflow-auto">
          <Stage
            ref={(r) => {
              stageRef.current = r;
            }}
            width={stageSize.w}
            height={stageSize.h}
          >
            <Layer>
              {img ? <KonvaImage image={img} x={0} y={0} width={stageSize.w} height={stageSize.h} /> : null}

              {showGrid ? <Grid w={stageSize.w} h={stageSize.h} step={Math.max(5, gridSizePx)} /> : null}

              {guides?.x != null ? (
                <Line points={[guides.x, 0, guides.x, stageSize.h]} stroke="#22c55e" strokeWidth={1} listening={false} />
              ) : null}
              {guides?.y != null ? (
                <Line points={[0, guides.y, stageSize.w, guides.y]} stroke="#22c55e" strokeWidth={1} listening={false} />
              ) : null}

              {fieldsOnPage.map((f) => {
                const b = applyGlobal(f.box, map.transform);
                const x = b.x * stageSize.w;
                const y = b.y * stageSize.h;
                const w = b.w * stageSize.w;
                const h = b.h * stageSize.h;

                const color = normalizeFieldColor(f.type);
                const isSelected = selectedId === f.id;
                const stLocal = styleForField(map, f.id);

                const text = previewFill ? previewSampleForField(f) : "";
                let fitted: { lines: string[]; size: number; lineH: number } | null = null;
                if (previewFill && text && measurer) {
                  const fitStyle: FitStyle = {
                    paddingPx: stLocal.paddingPx,
                    alignX: stLocal.alignX,
                    alignY: stLocal.alignY,
                    maxFontSize: stLocal.maxFontSize,
                    minFontSize: stLocal.minFontSize,
                    singleLine: stLocal.singleLine,
                  };

                  const res = fitTextInBox(
                    {
                      widthOfTextAtSize: (t, size) => measurer.measure("Helvetica", size, t),
                    },
                    text,
                    { w, h },
                    fitStyle
                  );

                  fitted = { lines: res.lines, size: res.size, lineH: res.lineH };
                }

                const pad = Math.max(0, Number(stLocal.paddingPx) || 0);
                const contentW = Math.max(1, w - pad * 2);

                let startY = y + pad;
                if (fitted) {
                  const blockH = fitted.lines.length * fitted.lineH;
                  if (stLocal.alignY === "middle") startY = y + (h - blockH) / 2;
                  if (stLocal.alignY === "bottom") startY = y + h - pad - blockH;
                }

                return (
                  <Fragment key={f.id}>
                    <Rect
                      id={`box-${f.id}`}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      stroke={isSelected ? "#16a34a" : color}
                      strokeWidth={isSelected ? 2 : 1}
                      draggable
                      onClick={() => setSelectedId(f.id)}
                      onTap={() => setSelectedId(f.id)}
                      onDragMove={(ev) => {
                        const nx = ev.target.x();
                        const ny = ev.target.y();
                        setGuides({ x: snapToGrid ? snapPx(nx, true, gridSizePx) : nx, y: snapToGrid ? snapPx(ny, true, gridSizePx) : ny });
                      }}
                      onDragEnd={(ev) => {
                        const nx = ev.target.x();
                        const ny = ev.target.y();
                        setActiveBox(f.id, {
                          ...b,
                          x: nx / stageSize.w,
                          y: ny / stageSize.h,
                        });
                        setGuides(null);
                      }}
                      onTransformEnd={(ev) => {
                        const node = ev.target as any;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();

                        const newX = node.x();
                        const newY = node.y();
                        const newW = Math.max(2, node.width() * scaleX);
                        const newH = Math.max(2, node.height() * scaleY);

                        node.scaleX(1);
                        node.scaleY(1);

                        const snapped = applySnapToPxRect({ x: newX, y: newY, w: newW, h: newH }, snapToGrid, gridSizePx);
                        setGuides({ x: snapped.x, y: snapped.y });

                        setActiveBox(f.id, {
                          x: snapped.x / stageSize.w,
                          y: snapped.y / stageSize.h,
                          w: snapped.w / stageSize.w,
                          h: snapped.h / stageSize.h,
                        });

                        setGuides(null);
                      }}
                    />

                    {previewFill && fitted ? (
                      <>
                        {fitted.lines.map((ln, i) => {
                          const lnW = measurer ? measurer.measure("Helvetica", fitted!.size, ln) : 0;
                          let tx = x + pad;
                          if (stLocal.alignX === "center") tx = x + w / 2 - lnW / 2;
                          if (stLocal.alignX === "right") tx = x + w - pad - lnW;

                          return (
                            <KonvaText
                              key={`txt-${f.id}-${i}`}
                              x={tx}
                              y={startY + i * fitted!.lineH}
                              width={contentW}
                              text={ln}
                              fontFamily="Helvetica"
                              fontSize={fitted!.size}
                              fill="#0f172a"
                              listening={false}
                            />
                          );
                        })}
                      </>
                    ) : null}
                  </Fragment>
                );
              })}

              <Transformer
                ref={(r) => {
                  trRef.current = r;
                }}
                rotateEnabled={false}
                keepRatio={false}
                enabledAnchors={[
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                  "middle-left",
                  "middle-right",
                  "top-center",
                  "bottom-center",
                ]}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 4 || newBox.height < 4) return oldBox;
                  return newBox;
                }}
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold text-slate-900">{label}</span>
      <input
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
        value={String(Number.isFinite(value) ? value : 0)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold text-slate-900">{label}</span>
      <input
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`rounded-md border px-2 py-1 text-xs font-semibold ${
        value ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-900"
      }`}
    >
      {label}: {value ? "on" : "off"}
    </button>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold text-slate-900">{label}</span>
      <select
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Grid({ w, h, step }: { w: number; h: number; step: number }) {
  const lines: any[] = [];
  for (let x = 0; x <= w; x += step) {
    lines.push(<Line key={`gx-${x}`} points={[x, 0, x, h]} stroke="#e2e8f0" strokeWidth={1} listening={false} />);
  }
  for (let y = 0; y <= h; y += step) {
    lines.push(<Line key={`gy-${y}`} points={[0, y, w, y]} stroke="#e2e8f0" strokeWidth={1} listening={false} />);
  }
  return <>{lines}</>;
}
