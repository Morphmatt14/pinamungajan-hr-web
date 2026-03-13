import { normalizeScanToLegal } from "@/lib/pds/normalizeScanToLegal";

export type PreprocessDebug = {
  normalized: any;
  contrast: { used: boolean; method: "linear" | "none" };
  grayscale: boolean;
  warnings: string[];
  cropBox?: { left: number; top: number; width: number; height: number };
};

export async function preprocessPdsPage(input: {
  bytes: Buffer;
  mimeType: string;
  pageIndex: number;
  dpi: number;
}): Promise<{ buffer: Buffer; debug: PreprocessDebug }> {
  const warnings: string[] = [];

  // Base normalization (rotate + crop/pad to legal) using existing pipeline.
  const norm = await normalizeScanToLegal({
    bytes: input.bytes,
    mimeType: input.mimeType,
    pageIndex: input.pageIndex,
    dpi: input.dpi,
    enhance: true,
  });

  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    warnings.push("sharp_missing");
    return {
      buffer: norm.buffer,
      debug: {
        normalized: norm.debug,
        contrast: { used: false, method: "none" },
        grayscale: false,
        warnings,
        cropBox: norm.debug.cropBox,
      },
    };
  }

  // Light post-enhancement to help faint pencil/pen strokes without destroying text.
  // (Avoid hard thresholding; use mild linear contrast and sharpening.)
  const out = await sharp(norm.buffer)
    .grayscale()
    .linear(1.12, -10)
    .sharpen({ sigma: 0.8 })
    .png()
    .toBuffer();

  return {
    buffer: out,
    debug: {
      normalized: norm.debug,
      contrast: { used: true, method: "linear" },
      grayscale: true,
      warnings,
      cropBox: norm.debug.cropBox,
    },
  };
}
