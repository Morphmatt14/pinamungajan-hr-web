export type NormBox = { x: number; y: number; w: number; h: number };

export type FieldType =
  | "text"
  | "date"
  | "checkbox"
  | "table"
  | "photo"
  | "signature"
  | "thumbmark";

export type CheckboxChoice = {
  id: string; // e.g. "sex_at_birth.male"
  label?: string;
  box: NormBox;
};

export type TableGeometry = {
  startY: number; // normalized
  rowHeight: number; // normalized
  maxRows: number;
  columns: Array<{ id: string; label?: string; x: number; w: number }>; // x,w normalized within table box
};

export type FieldDef = {
  id: string; // stable fieldId used everywhere
  label?: string;
  page: number;
  type: FieldType;
  box: NormBox;
  options?:
    | {
        kind: "text";
      }
    | {
        kind: "date";
        format: "dd/mm/yyyy";
      }
    | {
        kind: "checkbox";
        choices: CheckboxChoice[];
      }
    | {
        kind: "table";
        table: TableGeometry;
      }
    | {
        kind: "photo";
      }
    | {
        kind: "signature";
      }
    | {
        kind: "thumbmark";
      };
};

export type FieldStyle = {
  paddingPx: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "middle" | "bottom";
  maxFontSize: number;
  minFontSize: number;
  singleLine: boolean;
};

export type MapJsonV2 = {
  schema_version: 2;
  template_version: string; // e.g. "2025"
  page: number;
  transform: { sx: number; sy: number; dx: number; dy: number };
  fields: FieldDef[];
  styles?: Record<string, FieldStyle>;
};

export function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function sanitizeBox(b: NormBox): NormBox {
  const x1 = clamp01(b.x);
  const y1 = clamp01(b.y);
  const x2 = clamp01(b.x + b.w);
  const y2 = clamp01(b.y + b.h);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

export function applyGlobal(box: NormBox, t: MapJsonV2["transform"]): NormBox {
  return sanitizeBox({ x: box.x * t.sx + t.dx, y: box.y * t.sy + t.dy, w: box.w * t.sx, h: box.h * t.sy });
}

export function invertGlobal(box: NormBox, t: MapJsonV2["transform"]): NormBox {
  return sanitizeBox({
    x: (box.x - t.dx) / Math.max(1e-9, t.sx),
    y: (box.y - t.dy) / Math.max(1e-9, t.sy),
    w: box.w / Math.max(1e-9, t.sx),
    h: box.h / Math.max(1e-9, t.sy),
  });
}
