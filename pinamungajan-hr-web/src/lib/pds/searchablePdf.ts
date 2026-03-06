import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocToken } from "@/lib/pds/documentAiTokens";

export type SearchablePdfResult = {
  bytes: Uint8Array;
  debug: {
    pageCount: number;
    tokenCount: number;
    usedBackground: "original_pdf" | "original_image";
  };
};

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function normTokenText(t: string) {
  return String(t || "").replace(/\s+/g, " ").trim();
}

export async function buildSearchablePdfFromOriginalAndTokens(params: {
  originalBytes: Buffer;
  originalMimeType: string;
  tokens: DocToken[];
}): Promise<SearchablePdfResult> {
  const mime = String(params.originalMimeType || "");
  const pdfDoc = await PDFDocument.create();

  const pageIndex = 0;
  const pageTokens = (params.tokens || []).filter((t) => t.pageIndex === pageIndex);

  let page;
  let usedBackground: "original_pdf" | "original_image";

  if (mime === "application/pdf") {
    const src = await PDFDocument.load(params.originalBytes);
    const [embedded] = await pdfDoc.embedPdf(await src.save(), [0]);
    page = pdfDoc.addPage([embedded.width, embedded.height]);
    page.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    usedBackground = "original_pdf";
  } else if (mime.startsWith("image/")) {
    // Use sharp to normalize to PNG so we can embed reliably.
    const sharp = (await import("sharp")).default;
    const pngBytes = await sharp(params.originalBytes).png().toBuffer();
    const img = await pdfDoc.embedPng(pngBytes);
    page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    usedBackground = "original_image";
  } else {
    throw new Error(`Unsupported mime type for searchable PDF: ${mime}`);
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { width: pageW, height: pageH } = page.getSize();

  // Draw invisible-ish text layer (pdf-lib doesn't support true invisibility, so use tiny opacity).
  for (const tok of pageTokens) {
    const text = normTokenText(tok.text);
    if (!text) continue;

    const boxW = Math.max(0.0001, clamp01(tok.box.maxX) - clamp01(tok.box.minX));
    const boxH = Math.max(0.0001, clamp01(tok.box.maxY) - clamp01(tok.box.minY));

    const x = clamp01(tok.box.minX) * pageW;
    // DocumentAI y=0 top, PDF y=0 bottom
    const yTop = clamp01(tok.box.minY) * pageH;
    const y = pageH - yTop - boxH * pageH;

    const targetH = boxH * pageH;
    const fontSize = Math.max(4, Math.min(18, targetH * 0.9));

    // Keep within page bounds
    if (x < -10 || y < -10 || x > pageW + 10 || y > pageH + 10) continue;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      opacity: 0.01,
      // NOTE: Not rotating/skewing; good enough for aligned scans.
      maxWidth: boxW * pageW + 2,
      lineHeight: fontSize,
    });
  }

  const bytes = await pdfDoc.save();
  return {
    bytes,
    debug: {
      pageCount: 1,
      tokenCount: pageTokens.length,
      usedBackground,
    },
  };
}
