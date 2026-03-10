export type FitStyle = {
  paddingPx: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "middle" | "bottom";
  maxFontSize: number;
  minFontSize: number;
  singleLine: boolean;
};

export type FitResult =
  | {
      mode: "single";
      text: string;
      size: number;
      lineH: number;
      lines: string[];
    }
  | {
      mode: "wrap";
      size: number;
      lineH: number;
      lines: string[];
    };

export type TextMeasurer = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

export function fitTextToWidth(
  measurer: TextMeasurer,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number
) {
  let size = maxSize;
  while (size >= minSize) {
    const w = measurer.widthOfTextAtSize(text, size);
    if (w <= maxWidth) return { text, size };
    size -= 0.5;
  }

  const finalSize = minSize;
  let t = text;
  while (t.length > 0 && measurer.widthOfTextAtSize(`${t}…`, finalSize) > maxWidth) {
    t = t.slice(0, -1);
  }
  return { text: t ? `${t}…` : "", size: finalSize };
}

export function wrapTextByWords(measurer: TextMeasurer, text: string, maxWidth: number, size: number): string[] {
  const words = String(text || "")
    .split(/\s+/g)
    .filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (measurer.widthOfTextAtSize(cand, size) <= maxWidth) {
      cur = cand;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function fitWrappedText(
  measurer: TextMeasurer,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
  minSize: number
) {
  let size = maxSize;
  while (size >= minSize) {
    const lines = wrapTextByWords(measurer, text, maxWidth, size);
    const lineH = size * 1.1;
    if (lines.length * lineH <= maxHeight) return { lines, size, lineH };
    size -= 0.5;
  }

  const sizeFinal = minSize;
  const lines = wrapTextByWords(measurer, text, maxWidth, sizeFinal);
  const lineH = sizeFinal * 1.1;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineH));
  const clipped = lines.slice(0, maxLines);
  if (clipped.length === 0) return { lines: [""], size: sizeFinal, lineH };

  let last = clipped[clipped.length - 1];
  while (last.length > 0 && measurer.widthOfTextAtSize(`${last}…`, sizeFinal) > maxWidth) last = last.slice(0, -1);
  clipped[clipped.length - 1] = last ? `${last}…` : "";
  return { lines: clipped, size: sizeFinal, lineH };
}

export function fitTextInBox(measurer: TextMeasurer, text: string, boxPx: { w: number; h: number }, style: FitStyle): FitResult {
  const pad = Math.max(0, Number(style.paddingPx) || 0);
  const maxW = Math.max(1, boxPx.w - pad * 2);
  const maxH = Math.max(1, boxPx.h - pad * 2);

  const maxSize = Number(style.maxFontSize) || 11;
  const minSize = Number(style.minFontSize) || 6;

  if (style.singleLine) {
    const r = fitTextToWidth(measurer, text, maxW, maxSize, minSize);
    return { mode: "single", text: r.text, size: r.size, lineH: r.size * 1.1, lines: [r.text] };
  }

  const r = fitWrappedText(measurer, text, maxW, maxH, maxSize, minSize);
  return { mode: "wrap", size: r.size, lineH: r.lineH, lines: r.lines };
}
