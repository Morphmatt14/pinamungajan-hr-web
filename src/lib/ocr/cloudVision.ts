import vision from "@google-cloud/vision";
import type { DocToken } from "../pds/documentAiTokens";
import sharp from "sharp";

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
  // Get image dimensions for coordinate normalization
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 1;
  const imgHeight = metadata.height || 1;

  const client = new vision.ImageAnnotatorClient({
    credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON || "{}"),
  });

  const [result] = await client.textDetection({
    image: { content: imageBuffer },
  });

  const fullText = result.fullTextAnnotation?.text || "";
  const pages = result.fullTextAnnotation?.pages || [];
  const tokens: DocToken[] = [];

  // Convert Vision API blocks to tokens with normalized coordinates
  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = word.symbols?.map((s: any) => s.text).join("") || "";
          if (!text.trim()) continue;

          const vertices = word.boundingBox?.vertices || [];
          if (vertices.length < 4) continue;

          // Cloud Vision returns pixel coordinates - normalize to 0-1
          const minX = Math.min(...vertices.map((v: any) => v.x || 0)) / imgWidth;
          const maxX = Math.max(...vertices.map((v: any) => v.x || 0)) / imgWidth;
          const minY = Math.min(...vertices.map((v: any) => v.y || 0)) / imgHeight;
          const maxY = Math.max(...vertices.map((v: any) => v.y || 0)) / imgHeight;

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
