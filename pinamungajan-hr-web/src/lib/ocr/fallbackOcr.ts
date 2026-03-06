import Tesseract from "tesseract.js";

/**
 * Fallback OCR using Tesseract.js when Google Document AI fails
 */
export async function performFallbackOcr(imageBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  try {
    const result = await Tesseract.recognize(imageBuffer, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`[Tesseract] ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    return {
      text: result.data.text,
      confidence: result.data.confidence,
    };
  } catch (error) {
    console.error("[Tesseract] OCR failed:", error);
    throw error;
  }
}
