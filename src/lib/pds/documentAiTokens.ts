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
  // If the document actually already contains the simplified token list (DocToken[]),
  // return it directly. This allows us to use the same extractors for both 
  // Google Document AI and our internal simplified token format.
  if (Array.isArray(document?.tokens)) {
    return document.tokens;
  }

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

export function remapTokensToLegalSpace(
  tokens: DocToken[],
  originalWidth: number,
  originalHeight: number,
  cropBox: { left: number; top: number; width: number; height: number },
  dpi: number = 300
): DocToken[] {
  const targetW = Math.round(8.5 * dpi);
  const targetH = Math.round(13 * dpi);

  // The client tokens are relative to originalWidth x originalHeight.
  // We compute the true pixel box, subtract the cropBox, then scale to targetW/targetH.
  const s = Math.min(targetW / cropBox.width, targetH / cropBox.height);
  const dx = (targetW - cropBox.width * s) / 2;
  const dy = (targetH - cropBox.height * s) / 2;

  return tokens.map((t) => {
    const pxMinX = t.box.minX * originalWidth;
    const pxMaxX = t.box.maxX * originalWidth;
    const pxMinY = t.box.minY * originalHeight;
    const pxMaxY = t.box.maxY * originalHeight;

    const cropMinX = pxMinX - cropBox.left;
    const cropMaxX = pxMaxX - cropBox.left;
    const cropMinY = pxMinY - cropBox.top;
    const cropMaxY = pxMaxY - cropBox.top;

    return {
      ...t,
      box: {
        minX: (cropMinX * s + dx) / targetW,
        maxX: (cropMaxX * s + dx) / targetW,
        minY: (cropMinY * s + dy) / targetH,
        maxY: (cropMaxY * s + dy) / targetH,
        midX: (((cropMinX + cropMaxX) / 2) * s + dx) / targetW,
        midY: (((cropMinY + cropMaxY) / 2) * s + dy) / targetH,
      }
    };
  });
}
