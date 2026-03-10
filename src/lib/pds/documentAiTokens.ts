export type TokenBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  midX: number;
  midY: number;
};

export type DocToken = {
  pageIndex: number;
  text: string;
  box: TokenBox;
  confidence?: number | null;
};

export function getDocumentAiTokens(document: any): DocToken[] {
  const pages = (document?.pages || []) as any[];
  const fullText = String(document?.text || "");
  const out: DocToken[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const p = pages[pageIndex] as any;
    const toks = (p?.tokens || []) as any[];
    if (!Array.isArray(toks)) continue;

    for (const tok of toks) {
      const layout = tok?.layout;
      const bb = layout?.boundingPoly || layout?.bounding_poly;
      const verts = bb?.normalizedVertices || bb?.normalized_vertices;
      if (!Array.isArray(verts) || verts.length === 0) continue;

      const xs = verts.map((v: any) => Number(v.x ?? v.X ?? 0));
      const ys = verts.map((v: any) => Number(v.y ?? v.Y ?? 0));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const textAnchor = layout?.textAnchor || layout?.text_anchor;
      const seg = (textAnchor?.textSegments || textAnchor?.text_segments || [])[0];
      const start = Number(seg?.startIndex ?? seg?.start_index);
      const end = Number(seg?.endIndex ?? seg?.end_index);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

      const text = fullText.slice(start, end);
      if (!text) continue;

      out.push({
        pageIndex,
        text,
        confidence: typeof layout?.confidence === "number" ? layout.confidence : null,
        box: { minX, maxX, minY, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 },
      });
    }
  }

  return out;
}
