export type NormalizeMethod = "warp" | "crop_pad" | "none";

export type NormalizeDebug = {
  detectedPaper: boolean;
  method: NormalizeMethod;
  outputPx: { w: number; h: number };
  dpiUsed: number;
  warnings: string[];
  cropBox?: { left: number; top: number; width: number; height: number };
};

type NormalizeInput = {
  bytes: Buffer;
  mimeType: string;
  pageIndex: number;
  dpi: number;
  enhance: boolean;
  skipPaperCrop?: boolean;
};

export async function normalizeScanToLegal(input: NormalizeInput): Promise<{ buffer: Buffer; debug: NormalizeDebug }> {
  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    const out = input.bytes;
    return {
      buffer: out,
      debug: {
        detectedPaper: false,
        method: "none",
        outputPx: { w: 0, h: 0 },
        dpiUsed: input.dpi,
        warnings: ["sharp_missing"],
      },
    };
  }

  const targetW = Math.round(8.5 * input.dpi);
  const targetH = Math.round(13 * input.dpi);
  const warnings: string[] = [];

  const density = input.dpi;
  const src =
    input.mimeType === "application/pdf"
      ? sharp(input.bytes, { density, page: Math.max(0, input.pageIndex) })
      : sharp(input.bytes);

  const base = input.enhance ? src.rotate().normalise().sharpen({ sigma: 1 }) : src.rotate();
  const meta = await base.metadata();
  const srcW = Number(meta.width || 0);
  const srcH = Number(meta.height || 0);

  if (!srcW || !srcH) {
    const buf = await base.png().toBuffer();
    return {
      buffer: buf,
      debug: {
        detectedPaper: false,
        method: "none",
        outputPx: { w: targetW, h: targetH },
        dpiUsed: input.dpi,
        warnings: ["missing_dimensions"],
        cropBox: { left: 0, top: 0, width: srcW, height: srcH },
      },
    };
  }

  const previewW = Math.min(900, Math.max(300, Math.round(srcW * 0.25)));
  const preview = await base
    .clone()
    .resize({ width: previewW })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pW = preview.info.width;
  const pH = preview.info.height;
  const data = preview.data;

  function bboxFromPredicate(pred: (v: number) => boolean): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = pW,
      y0 = pH,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < pH; y++) {
      const row = y * pW;
      for (let x = 0; x < pW; x++) {
        const v = data[row + x];
        if (pred(v)) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0 || y1 < 0) return null;
    return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }

  const paperBox = bboxFromPredicate((v) => v >= 235);
  const contentBox = bboxFromPredicate((v) => v <= 230);

  let chosen = paperBox;
  let detectedPaper = Boolean(paperBox);

  const legalAspect = 13 / 8.5;

  function aspect(b: { x0: number; y0: number; x1: number; y1: number }) {
    const w = Math.max(1, b.x1 - b.x0);
    const h = Math.max(1, b.y1 - b.y0);
    return h / w;
  }

  if (chosen) {
    const a = aspect(chosen);
    if (a < legalAspect * 0.8 || a > legalAspect * 1.2) {
      chosen = null;
    }
  }

  if (!chosen && contentBox) {
    detectedPaper = false;
    chosen = contentBox;
  }

  if (!chosen || input.skipPaperCrop) {
    warnings.push(input.skipPaperCrop ? "skip_paper_crop" : "bbox_failed");
    
    if (input.skipPaperCrop) {
      // For manual crop workflow: just rotate and enhance, no resizing to legal
      // This preserves original aspect ratio and coordinates align perfectly
      const processed = input.enhance 
        ? base.rotate().normalise().sharpen({ sigma: 1 })
        : base.rotate();
      const buf = await processed.png().toBuffer();
      const meta2 = await processed.metadata();
      return {
        buffer: buf,
        debug: {
          detectedPaper: false,
          method: "none",
          outputPx: { w: meta2.width || srcW, h: meta2.height || srcH },
          dpiUsed: input.dpi,
          warnings: [...warnings, "skip_paper_crop"],
          cropBox: { left: 0, top: 0, width: srcW, height: srcH },
        },
      };
    }
    
    const buf = await base
      .clone()
      .resize({ width: targetW, height: targetH, fit: "contain", background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return {
      buffer: buf,
      debug: {
        detectedPaper: false,
        method: "crop_pad",
        outputPx: { w: targetW, h: targetH },
        dpiUsed: input.dpi,
        warnings,
        cropBox: { left: 0, top: 0, width: srcW, height: srcH },
      },
    };
  }

  const sx = srcW / pW;
  const sy = srcH / pH;

  let left = Math.max(0, Math.floor(chosen.x0 * sx));
  let top = Math.max(0, Math.floor(chosen.y0 * sy));
  let right = Math.min(srcW, Math.ceil(chosen.x1 * sx));
  let bottom = Math.min(srcH, Math.ceil(chosen.y1 * sy));

  const padPx = Math.round(Math.min(srcW, srcH) * 0.01);
  left = Math.max(0, left - padPx);
  top = Math.max(0, top - padPx);
  right = Math.min(srcW, right + padPx);
  bottom = Math.min(srcH, bottom + padPx);

  const cropW = Math.max(1, right - left);
  const cropH = Math.max(1, bottom - top);

  const cropped = base.clone().extract({ left, top, width: cropW, height: cropH });

  const fitMode = input.skipPaperCrop ? "fill" : "contain";
  const out = await cropped
    .resize({ width: targetW, height: targetH, fit: fitMode, background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  return {
    buffer: out,
    debug: {
      detectedPaper,
      method: "crop_pad",
      outputPx: { w: targetW, h: targetH },
      dpiUsed: input.dpi,
      warnings,
      cropBox: { left, top, width: cropW, height: cropH },
    },
  };
}
