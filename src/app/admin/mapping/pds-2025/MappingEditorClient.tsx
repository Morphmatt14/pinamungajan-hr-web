"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NormBox = { x: number; y: number; w: number; h: number };

type MapFields = {
  surname: NormBox;
  first_name: NormBox;
  middle_name: NormBox;
  name_extension: NormBox;
  date_of_birth: NormBox;
  place_of_birth: NormBox;
  citizenship: NormBox;
  sex: { male: NormBox; female: NormBox };
};

type MapJson = {
  transform: { sx: number; sy: number; dx: number; dy: number };
  fields: MapFields;
  styles?: Partial<Record<FieldId, FieldStyle>>;
};

type FieldStyle = {
  paddingPx: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "middle" | "bottom";
  maxFontSize: number;
  minFontSize: number;
  singleLine: boolean;
};

const DEFAULT_STYLE: FieldStyle = {
  paddingPx: 2,
  alignX: "left",
  alignY: "middle",
  maxFontSize: 11,
  minFontSize: 6,
  singleLine: true,
};

function styleForField(map: MapJson, id: FieldId): FieldStyle {
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

const FIELD_KEYS: Array<keyof Omit<MapFields, "sex">> = [
  "surname",
  "first_name",
  "middle_name",
  "name_extension",
  "date_of_birth",
  "place_of_birth",
  "citizenship",
];

type FieldId =
  | "surname"
  | "first_name"
  | "middle_name"
  | "name_extension"
  | "date_of_birth"
  | "place_of_birth"
  | "citizenship"
  | "sex.male"
  | "sex.female";

const FIELD_IDS: FieldId[] = [
  "surname",
  "first_name",
  "middle_name",
  "name_extension",
  "date_of_birth",
  "place_of_birth",
  "citizenship",
  "sex.male",
  "sex.female",
];

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeBox(b: NormBox): NormBox {
  const x1 = clamp01(b.x);
  const y1 = clamp01(b.y);
  const x2 = clamp01(b.x + b.w);
  const y2 = clamp01(b.y + b.h);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

function getBox(fields: MapFields, id: FieldId): NormBox {
  if (id === "sex.male") return fields.sex.male;
  if (id === "sex.female") return fields.sex.female;
  return (fields as any)[id] as NormBox;
}

function setBox(fields: MapFields, id: FieldId, next: NormBox): MapFields {
  const s = sanitizeBox(next);
  if (id === "sex.male") return { ...fields, sex: { ...fields.sex, male: s } };
  if (id === "sex.female") return { ...fields, sex: { ...fields.sex, female: s } };
  return { ...fields, [id]: s } as any;
}

function applyGlobal(fields: MapFields, t: MapJson["transform"]): MapFields {
  const tx = (b: NormBox): NormBox => ({ x: b.x * t.sx + t.dx, y: b.y * t.sy + t.dy, w: b.w * t.sx, h: b.h * t.sy });
  const out: any = {};
  for (const k of FIELD_KEYS) out[k] = sanitizeBox(tx((fields as any)[k]));
  out.sex = {
    male: sanitizeBox(tx(fields.sex.male)),
    female: sanitizeBox(tx(fields.sex.female)),
  };
  return out as MapFields;
}

function getPointer(e: PointerEvent | React.PointerEvent) {
  return { x: (e as any).clientX as number, y: (e as any).clientY as number };
}

export function MappingEditorClient() {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [map, setMap] = useState<MapJson | null>(null);
  const [baseFields, setBaseFields] = useState<MapFields | null>(null);

  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const [selected, setSelected] = useState<FieldId>("surname");
  const [previewFill, setPreviewFill] = useState(true);

  const [zoom, setZoom] = useState(1);

  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const [guides, setGuides] = useState<{ x?: number; y?: number } | null>(null);

  const templatePngUrl = useMemo(() => {
    return `/templates/pds-2025-page1.png`;
  }, []);

  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateImgSrc, setTemplateImgSrc] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const activeFields = useMemo(() => {
    if (!map) return null;
    return applyGlobal(map.fields, map.transform);
  }, [map]);

  async function loadTemplateImage() {
    setTemplateLoading(true);
    setTemplateError(null);
    setTemplateImgSrc(templatePngUrl);
    setTemplateLoading(false);
  }

  useEffect(() => {
    loadTemplateImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatePngUrl]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/pds/map?template=2025&page=1`, { credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const j = await res.json();

        setLoadWarning(typeof j?.warning === "string" ? j.warning : null);

        // Fallback defaults if DB empty: ask server for current TS map via calibrate JSON.
        let initial: MapJson | null = null;
        if (j?.map_json?.fields) {
          initial = j.map_json as MapJson;
        } else {
          const res2 = await fetch(`/api/pds/calibrate`, { credentials: "include" });
          if (!res2.ok) throw new Error(await res2.text());
          const j2 = await res2.json();
          initial = { transform: { sx: 1, sy: 1, dx: 0, dy: 0 }, fields: j2.map as MapFields };
        }

        if (!cancelled) {
          setMap(initial);
          setBaseFields(initial.fields);
        }
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
  }, []);

  const templateSurface = useMemo(() => {
    if (!templateImgSrc) {
      return (
        <div className="flex h-[900px] w-[700px] items-center justify-center rounded border bg-slate-50 text-sm text-slate-700">
          {templateLoading ? "Loading template…" : "Template not loaded"}
        </div>
      );
    }
    return (
      <img
        ref={(el) => {
          surfaceRef.current = el as any;
        }}
        src={templateImgSrc || ""}
        alt="PDS 2025 template"
        className="block max-w-full"
        draggable={false}
        onError={() =>
          setTemplateError(
            `Failed to display template image element.\n\nURL: ${templatePngUrl}\n\nTip: open the URL directly to see diagnostics.`
          )
        }
      />
    );
  }, [templateImgSrc, templateLoading, templatePngUrl]);

  function measureTextWidth(text: string, fontSizePx: number) {
    const c = measureCanvasRef.current;
    if (!c) return 0;
    const ctx = c.getContext("2d");
    if (!ctx) return 0;
    ctx.font = `${fontSizePx}px Arial`;
    return ctx.measureText(text).width;
  }

  function fitTextSingleLine(text: string, maxW: number, maxSize: number, minSize: number) {
    let size = maxSize;
    while (size >= minSize) {
      if (measureTextWidth(text, size) <= maxW) return { text, size };
      size -= 0.5;
    }
    const finalSize = minSize;
    let t = text;
    while (t.length > 0 && measureTextWidth(`${t}…`, finalSize) > maxW) t = t.slice(0, -1);
    return { text: t ? `${t}…` : "", size: finalSize };
  }

  function resolvePreviewText(id: FieldId) {
    if (!map || !activeFields) {
      return {
        text: "",
        size: DEFAULT_STYLE.minFontSize,
        pad: DEFAULT_STYLE.paddingPx,
        alignX: DEFAULT_STYLE.alignX,
        alignY: DEFAULT_STYLE.alignY,
      };
    }
    const st = styleForField(map, id);
    const text = sampleValueFor(id);
    const r = pxRectFromNorm(getBox(activeFields, id));
    if (!r) return { text, size: st.minFontSize, pad: st.paddingPx, alignX: st.alignX, alignY: st.alignY };
    const pad = Math.max(0, st.paddingPx);
    const maxW = Math.max(1, r.width - pad * 2);
    const fitted = fitTextSingleLine(text, maxW, st.maxFontSize, st.minFontSize);
    return { text: fitted.text, size: fitted.size, pad, alignX: st.alignX, alignY: st.alignY };
  }

  function toNormFromPx(px: { x: number; y: number }) {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (px.x - rect.left) / rect.width;
    const y = (px.y - rect.top) / rect.height;
    return { x, y };
  }

  function pxRectFromNorm(box: NormBox) {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: box.x * rect.width,
      top: box.y * rect.height,
      width: box.w * rect.width,
      height: box.h * rect.height,
    };
  }

  function pxFromNormPoint(pt: { x: number; y: number }) {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: pt.x * rect.width, y: pt.y * rect.height };
  }

  function snap01(n: number, step: number) {
    if (!Number.isFinite(n)) return 0;
    const s = Math.max(1e-6, step);
    return Math.round(n / s) * s;
  }

  function maybeSnapBox(b: NormBox): NormBox {
    if (!snapToGrid) return b;
    const step = 0.01; // 100x100 grid in normalized coords
    return sanitizeBox({
      x: snap01(b.x, step),
      y: snap01(b.y, step),
      w: snap01(b.w, step),
      h: snap01(b.h, step),
    });
  }

  function snapMoveToOtherBoxes(movingId: FieldId, box: NormBox) {
    if (!activeFields) return { box, guides: null as any };
    const threshold = 0.003; // ~0.3% of page

    const mx1 = box.x;
    const mx2 = box.x + box.w;
    const mcx = box.x + box.w / 2;
    const my1 = box.y;
    const my2 = box.y + box.h;
    const mcy = box.y + box.h / 2;

    let bestDx: number | null = null;
    let bestDy: number | null = null;
    let guideX: number | undefined;
    let guideY: number | undefined;

    for (const id of FIELD_IDS) {
      if (id === movingId) continue;
      const ob = getBox(activeFields, id);
      const ox1 = ob.x;
      const ox2 = ob.x + ob.w;
      const ocx = ob.x + ob.w / 2;
      const oy1 = ob.y;
      const oy2 = ob.y + ob.h;
      const ocy = ob.y + ob.h / 2;

      const candidatesX: Array<{ target: number; cur: number; guide: number }> = [
        { target: ox1, cur: mx1, guide: ox1 },
        { target: ox2, cur: mx2, guide: ox2 },
        { target: ocx, cur: mcx, guide: ocx },
      ];
      for (const c of candidatesX) {
        const dx = c.target - c.cur;
        if (Math.abs(dx) <= threshold && (bestDx === null || Math.abs(dx) < Math.abs(bestDx))) {
          bestDx = dx;
          guideX = c.guide;
        }
      }

      const candidatesY: Array<{ target: number; cur: number; guide: number }> = [
        { target: oy1, cur: my1, guide: oy1 },
        { target: oy2, cur: my2, guide: oy2 },
        { target: ocy, cur: mcy, guide: ocy },
      ];
      for (const c of candidatesY) {
        const dy = c.target - c.cur;
        if (Math.abs(dy) <= threshold && (bestDy === null || Math.abs(dy) < Math.abs(bestDy))) {
          bestDy = dy;
          guideY = c.guide;
        }
      }
    }

    const snapped: NormBox = {
      ...box,
      x: box.x + (bestDx ?? 0),
      y: box.y + (bestDy ?? 0),
    };
    return { box: sanitizeBox(snapped), guides: guideX || guideY ? { x: guideX, y: guideY } : null };
  }

  const dragState = useRef<
    | null
    | {
        id: FieldId;
        mode: "move" | "resize-br";
        startNorm: { x: number; y: number };
        startBox: NormBox;
      }
  >(null);

  function onPointerDown(e: React.PointerEvent, id: FieldId, mode: "move" | "resize-br") {
    if (!map || !activeFields) return;
    const p = getPointer(e);
    const n = toNormFromPx(p);
    if (!n) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      id,
      mode,
      startNorm: n,
      startBox: getBox(activeFields, id),
    };
    setSelected(id);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!map || !activeFields) return;
    const st = dragState.current;
    if (!st) return;
    const p = getPointer(e);
    const n = toNormFromPx(p);
    if (!n) return;

    const dx = n.x - st.startNorm.x;
    const dy = n.y - st.startNorm.y;

    const next0 =
      st.mode === "move"
        ? { ...st.startBox, x: st.startBox.x + dx, y: st.startBox.y + dy }
        : { ...st.startBox, w: Math.max(0, st.startBox.w + dx), h: Math.max(0, st.startBox.h + dy) };

    let next = maybeSnapBox(next0);
    if (snapToGrid && st.mode === "move") {
      const snapped = snapMoveToOtherBoxes(st.id, next);
      next = snapped.box;
      setGuides(snapped.guides);
    }

    // Write edits into PRE-transform coordinates by reversing global transform.
    const t = map.transform;
    const inv: NormBox = {
      x: (next.x - t.dx) / t.sx,
      y: (next.y - t.dy) / t.sy,
      w: next.w / t.sx,
      h: next.h / t.sy,
    };

    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, fields: setBox(prev.fields, st.id, inv) };
    });
  }

  function onPointerUp() {
    dragState.current = null;
    setGuides(null);
  }

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (!map || !activeFields) return;
      if (!selected) return;

      const step = ev.shiftKey ? 0.005 : 0.001;
      const b = getBox(activeFields, selected);
      let nb: NormBox | null = null;

      if (ev.key === "ArrowLeft") nb = { ...b, x: b.x - step };
      if (ev.key === "ArrowRight") nb = { ...b, x: b.x + step };
      if (ev.key === "ArrowUp") nb = { ...b, y: b.y - step };
      if (ev.key === "ArrowDown") nb = { ...b, y: b.y + step };
      if (!nb) return;
      ev.preventDefault();

      const t = map.transform;
      const inv: NormBox = {
        x: (nb.x - t.dx) / t.sx,
        y: (nb.y - t.dy) / t.sy,
        w: nb.w / t.sx,
        h: nb.h / t.sy,
      };

      setMap((prev) => {
        if (!prev) return prev;
        return { ...prev, fields: setBox(prev.fields, selected, inv) };
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [map, activeFields, selected]);

  async function save() {
    if (!map) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/pds/map`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ template_version: "2025", page: 1, map_json: map }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function computeGlobalTransform() {
    if (!map || !baseFields || !activeFields) return;

    // Use two anchors: surname + DOB (left/top). Solve x' = x*sx + dx and y' = y*sy + dy.
    const a0 = getBox(baseFields, "surname");
    const b0 = getBox(baseFields, "date_of_birth");

    const a1 = getBox(activeFields, "surname");
    const b1 = getBox(activeFields, "date_of_birth");

    const sx = (b1.x - a1.x) / Math.max(1e-6, b0.x - a0.x);
    const sy = (b1.y - a1.y) / Math.max(1e-6, b0.y - a0.y);
    const dx = a1.x - a0.x * sx;
    const dy = a1.y - a0.y * sy;

    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, transform: { sx, sy, dx, dy } };
    });
  }

  if (loading) return <div className="text-sm text-slate-700">Loading…</div>;
  if (error) return <div className="text-sm text-red-700">Error: {error}</div>;
  if (!map || !activeFields) return <div className="text-sm text-red-700">No map loaded</div>;

  const allBoxes: Array<{ id: FieldId; label: string; box: NormBox; color: string }> = [
    { id: "surname", label: "surname", box: getBox(activeFields, "surname"), color: "#dc2626" },
    { id: "first_name", label: "first_name", box: getBox(activeFields, "first_name"), color: "#dc2626" },
    { id: "middle_name", label: "middle_name", box: getBox(activeFields, "middle_name"), color: "#dc2626" },
    { id: "name_extension", label: "name_extension", box: getBox(activeFields, "name_extension"), color: "#dc2626" },
    { id: "date_of_birth", label: "date_of_birth", box: getBox(activeFields, "date_of_birth"), color: "#dc2626" },
    { id: "place_of_birth", label: "place_of_birth", box: getBox(activeFields, "place_of_birth"), color: "#dc2626" },
    { id: "citizenship", label: "citizenship", box: getBox(activeFields, "citizenship"), color: "#dc2626" },
    { id: "sex.male", label: "sex.male", box: getBox(activeFields, "sex.male"), color: "#2563eb" },
    { id: "sex.female", label: "sex.female", box: getBox(activeFields, "sex.female"), color: "#2563eb" },
  ];

  const selectedBox = getBox(activeFields, selected);

  function moveFieldToNormPoint(fieldId: FieldId, n: { x: number; y: number }) {
    if (!map || !activeFields) return;
    const cur = getBox(activeFields, fieldId);
    const next: NormBox = {
      x: n.x - cur.w / 2,
      y: n.y - cur.h / 2,
      w: cur.w,
      h: cur.h,
    };

    const t = map.transform;
    const inv: NormBox = {
      x: (next.x - t.dx) / t.sx,
      y: (next.y - t.dy) / t.sy,
      w: next.w / t.sx,
      h: next.h / t.sy,
    };

    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, fields: setBox(prev.fields, fieldId, inv) };
    });
  }

  function onDropOnTemplate(ev: React.DragEvent) {
    if (!map || !activeFields) return;
    const raw = ev.dataTransfer.getData("text/pds-field") || "";
    const id = raw as FieldId;
    if (!raw) return;
    if (![
      "surname",
      "first_name",
      "middle_name",
      "name_extension",
      "date_of_birth",
      "place_of_birth",
      "citizenship",
      "sex.male",
      "sex.female",
    ].includes(raw)) {
      return;
    }

    ev.preventDefault();
    const n = toNormFromPx({ x: ev.clientX, y: ev.clientY });
    if (!n) return;
    setSelected(id);
    moveFieldToNormPoint(id, n);
  }

  function sampleValueFor(id: FieldId) {
    if (id === "surname") return "DEL ROSARIO";
    if (id === "first_name") return "JUAN";
    if (id === "middle_name") return "SANTOS";
    if (id === "name_extension") return "JR";
    if (id === "date_of_birth") return "01/23/1990";
    if (id === "place_of_birth") return "PINAMUNGAJAN, CEBU";
    if (id === "citizenship") return "FILIPINO";
    if (id === "sex.male") return "X";
    if (id === "sex.female") return "";
    return "";
  }

  function onClickPlace(ev: React.MouseEvent) {
    // Click to place the currently selected field (centered at click)
    // Avoid interfering with drag (we only place on simple clicks).
    if (!map || !activeFields) return;
    const n = toNormFromPx({ x: ev.clientX, y: ev.clientY });
    if (!n) return;
    moveFieldToNormPoint(selected, n);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-lg border bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Controls</div>

        {loadWarning ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
            Map storage warning: <span className="font-semibold">{loadWarning}</span>. Loading defaults from template.
          </div>
        ) : null}

        {templateError ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-900">
            <div className="font-semibold">Template image failed to load</div>
            <div className="mt-1 text-[11px] text-red-900/80">URL: {templatePngUrl}</div>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] text-red-950">
              {templateError}
            </pre>
            <button
              type="button"
              onClick={loadTemplateImage}
              className="mt-2 rounded-md bg-red-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-800"
            >
              Retry template load
            </button>
          </div>
        ) : null}

        {!templateError ? (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-700">
            <div>
              <span className="font-semibold">Template URL:</span> {templatePngUrl}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Status:</span> {templateLoading ? "loading…" : templateImgSrc ? "loaded" : "idle"}
            </div>
            <button
              type="button"
              onClick={loadTemplateImage}
              className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              Reload template
            </button>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2">
          <label className="text-xs font-semibold text-slate-800">Selected field</label>
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value as FieldId)}
          >
            {allBoxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          <div className="mt-2">
            <div className="text-xs font-semibold text-slate-800">Drag fields onto the template</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {allBoxes.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData("text/pds-field", b.id);
                    ev.dataTransfer.effectAllowed = "move";
                    setSelected(b.id);
                  }}
                  className={`rounded border px-2 py-1 text-[11px] ${selected === b.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold">x</span>: {selectedBox.x.toFixed(4)}
            </div>
            <div>
              <span className="font-semibold">y</span>: {selectedBox.y.toFixed(4)}
            </div>
            <div>
              <span className="font-semibold">w</span>: {selectedBox.w.toFixed(4)}
            </div>
            <div>
              <span className="font-semibold">h</span>: {selectedBox.h.toFixed(4)}
            </div>
            <div className="mt-2 text-[11px] text-slate-600">Arrow keys nudge. Hold Shift for bigger step.</div>
          </div>

          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-semibold text-slate-800">Global transform</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                ["sx", map.transform.sx],
                ["sy", map.transform.sy],
                ["dx", map.transform.dx],
                ["dy", map.transform.dy],
              ] as const).map(([k, v]) => (
                <label key={k} className="text-xs text-slate-700">
                  {k}
                  <input
                    className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                    value={String(v)}
                    onChange={(e) =>
                      setMap((prev) =>
                        prev
                          ? {
                              ...prev,
                              transform: { ...prev.transform, [k]: Number(e.target.value) },
                            }
                          : prev
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={computeGlobalTransform}
              className="mt-2 w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Compute global transform (surname + DOB anchors)
            </button>
          </div>

          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-semibold text-slate-800">Field style</div>
            {(() => {
              const st = styleForField(map, selected);
              const setStyle = (patch: Partial<FieldStyle>) =>
                setMap((prev) =>
                  prev
                    ? { ...prev, styles: { ...(prev.styles || {}), [selected]: { ...styleForField(prev, selected), ...patch } } }
                    : prev
                );
              return (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-700">
                    padding
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={String(st.paddingPx)}
                      onChange={(e) => setStyle({ paddingPx: Number(e.target.value) })}
                    />
                  </label>
                  <label className="text-xs text-slate-700">
                    singleLine
                    <select
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={st.singleLine ? "1" : "0"}
                      onChange={(e) => setStyle({ singleLine: e.target.value === "1" })}
                    >
                      <option value="1">true</option>
                      <option value="0">false</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-700">
                    alignX
                    <select
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={st.alignX}
                      onChange={(e) => setStyle({ alignX: e.target.value as any })}
                    >
                      <option value="left">left</option>
                      <option value="center">center</option>
                      <option value="right">right</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-700">
                    alignY
                    <select
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={st.alignY}
                      onChange={(e) => setStyle({ alignY: e.target.value as any })}
                    >
                      <option value="top">top</option>
                      <option value="middle">middle</option>
                      <option value="bottom">bottom</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-700">
                    maxFont
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={String(st.maxFontSize)}
                      onChange={(e) => setStyle({ maxFontSize: Number(e.target.value) })}
                    />
                  </label>
                  <label className="text-xs text-slate-700">
                    minFont
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={String(st.minFontSize)}
                      onChange={(e) => setStyle({ minFontSize: Number(e.target.value) })}
                    />
                  </label>
                </div>
              );
            })()}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-800">
            <input type="checkbox" checked={previewFill} onChange={(e) => setPreviewFill(e.target.checked)} />
            Preview fill
          </label>

          <label className="mt-2 flex items-center gap-2 text-xs text-slate-800">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Show grid
          </label>

          <label className="mt-1 flex items-center gap-2 text-xs text-slate-800">
            <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
            Snap to grid
          </label>

          <label className="mt-2 block text-xs text-slate-800">
            Zoom
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <div className="mt-1 text-[11px] text-slate-600">{Math.round(zoom * 100)}%</div>
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-2 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save mapping"}
          </button>

          <div className="mt-2 text-[11px] text-slate-600">
            Saving creates a new version row in <code>pds_template_maps</code>.
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-auto rounded-lg border bg-white p-2"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDragOver={(ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
        }}
        onDrop={onDropOnTemplate}
        onClick={onClickPlace}
      >
        <canvas ref={measureCanvasRef} className="hidden" />

        <div
          className="relative inline-block"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          {templateSurface}
          {showGrid ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)",
                backgroundSize: "10% 10%",
              }}
            />
          ) : null}

          {guides?.x != null ? (
            <div
              className="pointer-events-none absolute top-0 bottom-0"
              style={{
                left: `${guides.x * 100}%`,
                width: 0,
                borderLeft: "2px solid rgba(34,197,94,0.75)",
              }}
            />
          ) : null}
          {guides?.y != null ? (
            <div
              className="pointer-events-none absolute left-0 right-0"
              style={{
                top: `${guides.y * 100}%`,
                height: 0,
                borderTop: "2px solid rgba(34,197,94,0.75)",
              }}
            />
          ) : null}
        </div>

        <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-900">
          Drag to move. Drag bottom-right handle to resize.
        </div>

        {allBoxes.map((b) => {
          const r = pxRectFromNorm(b.box);
          if (!r) return null;
          const isSel = selected === b.id;

          const center = { x: b.box.x + b.box.w / 2, y: b.box.y + b.box.h / 2 };
          const centerPx = pxFromNormPoint(center);

          const preview = previewFill ? resolvePreviewText(b.id) : null;

          let justifyContent: any = "flex-start";
          if (preview?.alignY === "middle") justifyContent = "center";
          if (preview?.alignY === "bottom") justifyContent = "flex-end";

          let textAlign: any = "left";
          if (preview?.alignX === "center") textAlign = "center";
          if (preview?.alignX === "right") textAlign = "right";

          return (
            <div
              key={b.id}
              className="absolute"
              style={{
                left: r.left + 8,
                top: r.top + 8,
                width: r.width,
                height: r.height,
                border: `2px solid ${isSel ? b.color : b.color}`,
                boxShadow: isSel ? `0 0 0 2px rgba(0,0,0,0.15)` : undefined,
              }}
              onPointerDown={(e) => onPointerDown(e, b.id, "move")}
            >
              <div className="absolute -top-5 left-0 rounded bg-white/90 px-1 text-[11px] text-slate-900">
                {b.label}
              </div>

              {preview && preview.text ? (
                <div
                  className="pointer-events-none absolute inset-0 flex px-1 font-semibold text-slate-900"
                  style={{
                    justifyContent,
                    paddingLeft: preview.pad,
                    paddingRight: preview.pad,
                    paddingTop: preview.pad,
                    paddingBottom: preview.pad,
                    textAlign,
                    fontSize: preview.size,
                    lineHeight: 1.05,
                  }}
                >
                  <div style={{ width: "100%" }}>{preview.text}</div>
                </div>
              ) : null}

              {isSel && centerPx ? (
                <div className="pointer-events-none absolute left-0 top-full mt-1 rounded bg-white/90 px-1 text-[10px] text-slate-900">
                  norm x:{b.box.x.toFixed(4)} y:{b.box.y.toFixed(4)} w:{b.box.w.toFixed(4)} h:{b.box.h.toFixed(4)}
                  <br />
                  px x:{r.left.toFixed(1)} y:{r.top.toFixed(1)} w:{r.width.toFixed(1)} h:{r.height.toFixed(1)}
                </div>
              ) : null}

              <div
                className="absolute bottom-0 right-0 h-3 w-3"
                style={{ background: b.color, cursor: "nwse-resize" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(e, b.id, "resize-br");
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
