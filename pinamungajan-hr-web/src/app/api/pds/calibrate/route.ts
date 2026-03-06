import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFName } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDS2025_PAGE1_NORM_MAP, type NormBox } from "@/lib/pds2025/pdfFillMap";

export const runtime = "nodejs";

function normBoxToPdfRect(box: NormBox, pageW: number, pageH: number) {
  const x = box.x * pageW;
  const w = box.w * pageW;
  const h = box.h * pageH;
  const yTop = box.y * pageH;
  const y = pageH - yTop - h;
  return { x, y, w, h };
}

function rotatePoint(pt: { x: number; y: number }, pageW: number, pageH: number, rotationDeg: number) {
  const r = ((rotationDeg % 360) + 360) % 360;
  if (r === 0) return pt;
  if (r === 90) return { x: pt.y, y: pageW - pt.x };
  if (r === 180) return { x: pageW - pt.x, y: pageH - pt.y };
  if (r === 270) return { x: pageH - pt.y, y: pt.x };
  return pt;
}

function normBoxToPdfRectWithRotation(box: NormBox, pageW: number, pageH: number, rotationDeg: number) {
  const r0 = normBoxToPdfRect(box, pageW, pageH);
  const p1 = rotatePoint({ x: r0.x, y: r0.y }, pageW, pageH, rotationDeg);
  const p2 = rotatePoint({ x: r0.x + r0.w, y: r0.y }, pageW, pageH, rotationDeg);
  const p3 = rotatePoint({ x: r0.x, y: r0.y + r0.h }, pageW, pageH, rotationDeg);
  const p4 = rotatePoint({ x: r0.x + r0.w, y: r0.y + r0.h }, pageW, pageH, rotationDeg);
  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantsPdf = url.searchParams.get("pdf") === "1";
  const debugGrid = url.searchParams.get("grid") === "1";

  const templatePath = path.join(
    process.cwd(),
    "public",
    "guides",
    "CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf"
  );

  const templateBytes = await readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page1 = pdfDoc.getPage(0);
  const { width: pageW, height: pageH } = page1.getSize();
  const rotation = (page1.getRotation?.().angle ?? 0) as number;

  let cropBox: number[] | null = null;
  try {
    const maybe = (page1 as any).node?.get?.(PDFName.of("CropBox"));
    const arr = maybe?.asArray?.() ?? maybe;
    if (arr && typeof arr.size === "function" && arr.size() === 4) {
      cropBox = [0, 1, 2, 3].map((i) => Number(arr.get(i)?.asNumber?.() ?? arr.get(i))) as number[];
    }
  } catch {
    cropBox = null;
  }

  const aspect = pageW > 0 ? pageH / pageW : null;

  if (!wantsPdf) {
    return NextResponse.json({
      ok: true,
      templatePath: "public/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf",
      pageIndex: 0,
      pageW,
      pageH,
      aspect,
      rotation,
      cropBox,
      map: PDS2025_PAGE1_NORM_MAP,
    });
  }

  // Render overlay PDF
  const red = rgb(1, 0, 0);

  function drawBox(name: string, box: NormBox) {
    const r = normBoxToPdfRectWithRotation(box, pageW, pageH, rotation);
    page1.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, borderColor: red, borderWidth: 0.8, opacity: 0.9 });
    page1.drawText(name, { x: r.x + 1.5, y: r.y + r.h + 1.5, size: 7, font, color: red });
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    page1.drawLine({ start: { x: cx - 6, y: cy }, end: { x: cx + 6, y: cy }, thickness: 0.7, color: red });
    page1.drawLine({ start: { x: cx, y: cy - 6 }, end: { x: cx, y: cy + 6 }, thickness: 0.7, color: red });
  }

  if (debugGrid) {
    for (let i = 1; i < 10; i++) {
      const gx = (i / 10) * pageW;
      page1.drawLine({ start: { x: gx, y: 0 }, end: { x: gx, y: pageH }, thickness: 0.4, color: red, opacity: 0.25 });
      const gy = (i / 10) * pageH;
      page1.drawLine({ start: { x: 0, y: gy }, end: { x: pageW, y: gy }, thickness: 0.4, color: red, opacity: 0.25 });
    }
  }

  const diagLines = [
    `PDS calibrate overlay`,
    `pageIndex=0`,
    `pageW=${pageW.toFixed(2)} pageH=${pageH.toFixed(2)} aspect=${aspect ? aspect.toFixed(3) : "null"}`,
    `rotation=${rotation}`,
    `cropBox=${cropBox ? `[${cropBox.map((n) => n.toFixed(2)).join(",")}]` : "null"}`,
  ];

  let diagY = pageH - 18;
  for (const ln of diagLines) {
    page1.drawText(ln, { x: 12, y: diagY, size: 8, font, color: rgb(0.6, 0, 0) });
    diagY -= 10;
  }

  drawBox("surname", PDS2025_PAGE1_NORM_MAP.surname);
  drawBox("first_name", PDS2025_PAGE1_NORM_MAP.first_name);
  drawBox("middle_name", PDS2025_PAGE1_NORM_MAP.middle_name);
  drawBox("name_extension", PDS2025_PAGE1_NORM_MAP.name_extension);
  drawBox("date_of_birth", PDS2025_PAGE1_NORM_MAP.date_of_birth);
  drawBox("place_of_birth", PDS2025_PAGE1_NORM_MAP.place_of_birth);
  drawBox("citizenship", PDS2025_PAGE1_NORM_MAP.citizenship);
  drawBox("sex_male", PDS2025_PAGE1_NORM_MAP.sex.male);
  drawBox("sex_female", PDS2025_PAGE1_NORM_MAP.sex.female);

  const out = await pdfDoc.save();
  return new NextResponse(Buffer.from(out), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=pds-calibrate-overlay.pdf`,
    },
  });
}
