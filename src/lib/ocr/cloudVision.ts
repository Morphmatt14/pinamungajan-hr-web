import vision from "@google-cloud/vision";
import type { DocToken } from "../pds/documentAiTokens";

/**
 * OCR using Google Cloud Vision API as fallback when Document AI fails
 */
export async function performCloudVisionOcr(
  imageBuffer: Buffer,
  pageIndex: number = 0
): Promise<{
  text: string;
  tokens: DocToken[];
  confidence: number;
}> {
  const client = new vision.ImageAnnotatorClient({
    credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON || "{}"),
  });

  const [result] = await client.textDetection({
    image: { content: imageBuffer },
  });

  const fullText = result.fullTextAnnotation?.text || "";
  const pages = result.fullTextAnnotation?.pages || [];
  const tokens: DocToken[] = [];

  // Convert Vision API blocks to tokens
  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = word.symbols?.map((s) => s.text).join("") || "";
          if (!text.trim()) continue;

          const vertices = word.boundingBox?.vertices || [];
          if (vertices.length < 4) continue;

          const minX = Math.min(...vertices.map((v) => v.x || 0));
          const maxX = Math.max(...vertices.map((v) => v.x || 0));
          const minY = Math.min(...vertices.map((v) => v.y || 0));
          const maxY = Math.max(...vertices.map((v) => v.y || 0));

          // Get confidence from word property
          const confidence = (word.confidence || 0.9) / 100; // Vision uses 0-1

          tokens.push({
            pageIndex,
            text,
            confidence,
            box: {
              minX,
              maxX,
              minY,
              maxY,
              midX: (minX + maxX) / 2,
              midY: (minY + maxY) / 2,
            },
          });
        }
      }
    }
  }

  // Calculate overall confidence
  const avgConfidence = tokens.length > 0 
    ? tokens.reduce((sum, t) => sum + (t.confidence || 0), 0) / tokens.length 
    : 0;

  return {
    text: fullText,
    tokens,
    confidence: avgConfidence,
  };
}
