import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { READ_ONLY_MODE } from "@/lib/readOnlyMode";

export async function GET(request: Request) {
  if (READ_ONLY_MODE) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);

  const title = url.searchParams.get("title") || "Pinamungajan HR Document";
  const extractionId = url.searchParams.get("extraction_id");

  let body =
    url.searchParams.get("body") ||
    "This is an editable document placeholder. OCR/searchable PDF generation will be added next.";

  if (extractionId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("extractions")
      .select("raw_extracted_json")
      .eq("id", extractionId)
      .single();

    const text = (data as any)?.raw_extracted_json?.text;
    if (typeof text === "string" && text.trim().length > 0) {
      body = text;
    }
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 32 })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [new TextRun({ text: body, size: 24 })],
          }),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  const bytes = new Uint8Array(buf);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="reconstructed.docx"',
      "Cache-Control": "no-store",
    },
  });
}
