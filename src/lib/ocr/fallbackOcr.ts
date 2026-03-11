import { createWorker } from "tesseract.js";
import type { DocToken } from "../pds/documentAiTokens";

/**
 * OCR using Tesseract.js to simulate Google Document AI tokens
 */
export async function performFallbackOcr(
  imageBuffer: Buffer,
  pageIndex: number = 0
): Promise<{
  text: string;
  tokens: DocToken[];
  confidence: number;
}> {
  let worker: Tesseract.Worker | null = null;
  try {
    // VERCEL TIMEOUT FIX: Force the "fast" Tesseract language model (11MB instead of 23MB)
    // This halves download and processing times to fit within the 10-second Serverless limit constraint.
    worker = await createWorker("eng", 1, {
      logger: (m) => {},
      langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
    });

    const result = await worker.recognize(imageBuffer);

    const words: any[] = (result.data as any).words || [];
    const tokens: DocToken[] = [];
    
    // Tesseract doesn't readily provide the image dimensions in its result in all cases,
    // but we can estimate normalized dimensions by finding the max x and y in the words.
    // A safer way is to rely on `imageBuffer` dimensions but for simplicity, we use max coordinates.
    // If the page has text covering most of it, this is a decent approximation.
    // However, for perfect accuracy, obtaining image width/height from sharp is better. (Handled in route.ts)

    for (const word of words) {
      if (!word.text || !word.text.trim()) continue;
      
      const bbox = word.bbox; // { x0, y0, x1, y1 }
      
      // We push absolute pixels here for now. 
      // The caller in route.ts will normalize these since it has the true image dimensions from `sharp`.
      tokens.push({
        pageIndex,
        text: word.text,
        confidence: word.confidence / 100, // Tesseract uses 0-100, docAI uses 0-1
        box: {
          minX: bbox.x0,
          maxX: bbox.x1,
          minY: bbox.y0,
          maxY: bbox.y1,
          midX: (bbox.x0 + bbox.x1) / 2,
          midY: (bbox.y0 + bbox.y1) / 2,
        },
      });
    }

    return {
      text: result.data.text,
      tokens,
      confidence: result.data.confidence,
    };
  } catch (error) {
    console.error("[Tesseract] OCR failed:", error);
    throw error;
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
