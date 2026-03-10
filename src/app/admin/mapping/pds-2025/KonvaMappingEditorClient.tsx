"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Image as KonvaImage, Transformer, Text as KonvaText, Line } from "react-konva";
import type Konva from "konva";
import { fitTextInBox, type FitStyle } from "@/lib/pds/fontFit";

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

type FieldStyle = {
  paddingPx: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "middle" | "bottom";
  maxFontSize: number;
  minFontSize: number;
  singleLine: boolean;
};

type MapJson = {
  transform: { sx: number; sy: number; dx: number; dy: number };
  fields: MapFields;
  styles?: Partial<Record<FieldId, FieldStyle>>;
};

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

function applyGlobal(box: NormBox, t: MapJson["transform"]): NormBox {
  return sanitizeBox({ x: box.x * t.sx + t.dx, y: box.y * t.sy + t.dy, w: box.w * t.sx, h: box.h * t.sy });
}

function invertGlobal(box: NormBox, t: MapJson["transform"]): NormBox {
  return sanitizeBox({
    x: (box.x - t.dx) / Math.max(1e-9, t.sx),
    y: (box.y - t.dy) / Math.max(1e-9, t.sy),
    w: box.w / Math.max(1e-9, t.sx),
    h: box.h / Math.max(1e-9, t.sy),
  });
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
      setError(`Template image failed to load: ${src}. Put the PNG under /public/templates/.`);
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

export function KonvaMappingEditorClient() {
  const templatePngUrl = "/templates/pds-2025-page1.png";
  const { img, error: imgError } = useHtmlImage(templatePngUrl);

  const [templateSize, setTemplateSize] = useState<{ w: number; h: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const [map, setMap] = useState<MapJson | null>(null);
  const [baseFields, setBaseFields] = useState<MapFields | null>(null);

  const [selected, setSelected] = useState<FieldId>("surname");
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
    setTemplateSize((prev) => prev ?? { w, h });
  }, [img]);

  const stageSize = useMemo(() => {
    return templateSize ?? { w: 700, h: 900 };
  }, [templateSize]);

  const activeFields = useMemo(() => {
    if (!map) return null;
    const t = map.transform;
    const f = map.fields;
    return {
      surname: applyGlobal(f.surname, t),
      first_name: applyGlobal(f.first_name, t),
      middle_name: applyGlobal(f.middle_name, t),
      name_extension: applyGlobal(f.name_extension, t),
      date_of_birth: applyGlobal(f.date_of_birth, t),
      place_of_birth: applyGlobal(f.place_of_birth, t),
      citizenship: applyGlobal(f.citizenship, t),
      sex: {
        male: applyGlobal(f.sex.male, t),
        female: applyGlobal(f.sex.female, t),
      },
    } as MapFields;
  }, [map]);

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

        let initial: MapJson | null = null;
        if (j?.map_json?.fields) {
          initial = j.map_json as MapJson;
        } else {
          const res2 = await fetch(`/api/pds/calibrate`, { credentials: "include" });
          if (!res2.ok) throw new Error(await res2.text());
          const j2 = await res2.json();
          initial = {
            transform: { sx: 1, sy: 1, dx: 0, dy: 0 },
            fields: j2.map as MapFields,
            styles: {},
          };
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

  // Arrow key nudge.
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (!map || !activeFields) return;
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;

      const step = ev.shiftKey ? 5 : 1;
      const sel = selected;
      const cur = getBox(activeFields, sel);

      const dxPx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
      const dyPx = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;

      const nx = cur.x + dxPx / stageSize.w;
      const ny = cur.y + dyPx / stageSize.h;

      const nextActive = sanitizeBox({ ...cur, x: nx, y: ny });
      const inv = invertGlobal(nextActive, map.transform);

      setMap((prev) => {
        if (!prev) return prev;
        return { ...prev, fields: setBox(prev.fields, sel, inv) };
      });

      ev.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [map, activeFields, selected, stageSize.w, stageSize.h]);

  // Keep Konva Transformer attached.
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    const stage = stageRef.current;
    const node = stage.findOne(`#box-${selected}`);
    if (node) {
      trRef.current.nodes([node as any]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, activeFields]);

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

  function computeGlobalTransformFromAnchors() {
    if (!map || !baseFields || !activeFields) return;

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

  function snapPx(n: number) {
    if (!snapToGrid) return n;
    const g = Math.max(1, gridSizePx);
    return Math.round(n / g) * g;
  }

  function applySnapToPxRect(r: { x: number; y: number; w: number; h: number }) {
    return {
      x: snapPx(r.x),
      y: snapPx(r.y),
      w: snapPx(r.w),
      h: snapPx(r.h),
    };
  }

  function setActiveBox(fieldId: FieldId, nextActive: NormBox) {
    if (!map) return;

    const nextPxRaw = {
      x: nextActive.x * stageSize.w,
      y: nextActive.y * stageSize.h,
      w: nextActive.w * stageSize.w,
      h: nextActive.h * stageSize.h,
    };

    const snapped = applySnapToPxRect(nextPxRaw);

    const nextPx = {
      x: snapped.x / stageSize.w,
      y: snapped.y / stageSize.h,
      w: snapped.w / stageSize.w,
      h: snapped.h / stageSize.h,
    };

    const inv = invertGlobal(sanitizeBox(nextPx), map.transform);
    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, fields: setBox(prev.fields, fieldId, inv) };
    });
  }

  function updateStyle(fieldId: FieldId, patch: Partial<FieldStyle>) {
    if (!map) return;
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

  function updateTransform(patch: Partial<MapJson["transform"]>) {
    if (!map) return;
    setMap((prev) => {
      if (!prev) return prev;
      return { ...prev, transform: { ...prev.transform, ...patch } };
    });
  }

  if (loading) return <div className="text-sm text-slate-700">Loading…</div>;
  if (error) return <div className="text-sm text-red-700">Error: {error}</div>;
  if (!map || !activeFields) return <div className="text-sm text-red-700">No map loaded</div>;

  if (!templateSize) {
    return (
      <div className="text-sm text-slate-700">
        Loading template image…{imgError ? ` (${imgError})` : ""}
      </div>
    );
  }

  const selectedBox = getBox(activeFields, selected);
  const st = styleForField(map, selected);

  const previewTextByField: Record<FieldId, string> = {
    surname: "DELA CRUZ",
    first_name: "JUAN",
    middle_name: "SANTOS",
    name_extension: "JR",
    date_of_birth: "06/03/1979",
    place_of_birth: "PINAMUNGAJAN, CEBU",
    citizenship: "FILIPINO",
    "sex.male": "X",
    "sex.female": "",
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Fields</div>
        {loadWarning ? <div className="mt-1 text-xs text-amber-700">Load warning: {loadWarning}</div> : null}

        <div className="mt-2 grid gap-1">
          {FIELD_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`rounded-md border px-2 py-1 text-left text-xs ${
                selected === id ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-900"
              }`}
            >
              {id}
            </button>
          ))}
        </div>

        <div className="mt-4 text-sm font-semibold text-slate-900">Properties</div>

        <div className="mt-2 grid gap-2">
          <div className="grid grid-cols-4 gap-2 text-xs">
            <NumField label="x" value={selectedBox.x} onChange={(v) => setActiveBox(selected, { ...selectedBox, x: v })} />
            <NumField label="y" value={selectedBox.y} onChange={(v) => setActiveBox(selected, { ...selectedBox, y: v })} />
            <NumField label="w" value={selectedBox.w} onChange={(v) => setActiveBox(selected, { ...selectedBox, w: v })} />
            <NumField label="h" value={selectedBox.h} onChange={(v) => setActiveBox(selected, { ...selectedBox, h: v })} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <NumField label="fontMin" value={st.minFontSize} onChange={(v) => updateStyle(selected, { minFontSize: v })} />
            <NumField label="fontMax" value={st.maxFontSize} onChange={(v) => updateStyle(selected, { maxFontSize: v })} />
            <NumField label="padding" value={st.paddingPx} onChange={(v) => updateStyle(selected, { paddingPx: v })} />
            <Toggle label="singleLine" value={st.singleLine} onChange={(v) => updateStyle(selected, { singleLine: v })} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Select
              label="alignX"
              value={st.alignX}
              options={["left", "center", "right"]}
              onChange={(v) => updateStyle(selected, { alignX: v as any })}
            />
            <Select
              label="alignY"
              value={st.alignY}
              options={["top", "middle", "bottom"]}
              onChange={(v) => updateStyle(selected, { alignY: v as any })}
            />
          </div>

          <div className="mt-2 rounded-lg border bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold text-slate-900">Global transform</div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
              <NumField label="sx" value={map.transform.sx} onChange={(v) => updateTransform({ sx: v })} />
              <NumField label="sy" value={map.transform.sy} onChange={(v) => updateTransform({ sy: v })} />
              <NumField label="dx" value={map.transform.dx} onChange={(v) => updateTransform({ dx: v })} />
              <NumField label="dy" value={map.transform.dy} onChange={(v) => updateTransform({ dy: v })} />
            </div>
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-50"
              onClick={computeGlobalTransformFromAnchors}
            >
              Compute from 2 anchors (Surname + DOB)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Toggle label="preview" value={previewFill} onChange={setPreviewFill} />
            <Toggle label="grid" value={showGrid} onChange={setShowGrid} />
            <Toggle label="snap" value={snapToGrid} onChange={setSnapToGrid} />
            <NumField label="gridPx" value={gridSizePx} onChange={(v) => setGridSizePx(Math.max(1, Math.round(v)))} />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {imgError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{imgError}</div>
          ) : null}
        </div>
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
            onMouseDown={(e) => {
              const clickedOnEmpty = e.target === e.target.getStage();
              if (clickedOnEmpty) {
                // keep selection
              }
            }}
          >
            <Layer>
              {img ? <KonvaImage image={img} x={0} y={0} width={stageSize.w} height={stageSize.h} /> : null}

              {showGrid ? (
                <Grid w={stageSize.w} h={stageSize.h} step={Math.max(5, gridSizePx)} />
              ) : null}

              {guides?.x != null ? (
                <Line points={[guides.x, 0, guides.x, stageSize.h]} stroke="#22c55e" strokeWidth={1} listening={false} />
              ) : null}
              {guides?.y != null ? (
                <Line points={[0, guides.y, stageSize.w, guides.y]} stroke="#22c55e" strokeWidth={1} listening={false} />
              ) : null}

              {FIELD_IDS.map((id) => {
                const b = getBox(activeFields, id);
                const x = b.x * stageSize.w;
                const y = b.y * stageSize.h;
                const w = b.w * stageSize.w;
                const h = b.h * stageSize.h;

                const isSex = id === "sex.male" || id === "sex.female";
                const color = isSex ? "#2563eb" : "#dc2626";

                const stLocal = styleForField(map, id);

                const text = previewFill ? previewTextByField[id] : "";

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
                  <>
                    <Rect
                      key={`rect-${id}`}
                      id={`box-${id}`}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      stroke={selected === id ? "#16a34a" : color}
                      strokeWidth={selected === id ? 2 : 1}
                      draggable
                      onClick={() => setSelected(id)}
                      onTap={() => setSelected(id)}
                      onDragMove={(ev) => {
                        const nx = ev.target.x();
                        const ny = ev.target.y();
                        setGuides({ x: snapToGrid ? snapPx(nx) : nx, y: snapToGrid ? snapPx(ny) : ny });
                      }}
                      onDragEnd={(ev) => {
                        const nx = ev.target.x();
                        const ny = ev.target.y();
                        setActiveBox(id, {
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

                        const snapped = applySnapToPxRect({ x: newX, y: newY, w: newW, h: newH });
                        setGuides({ x: snapped.x, y: snapped.y });

                        setActiveBox(id, {
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
                              key={`txt-${id}-${i}`}
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
                  </>
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
