import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { writeFile, unlink } from "node:fs/promises";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function importPdfjs() {
  const attempts = [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist/build/pdf.js",
  ];

  let lastErr: unknown = null;
  for (const spec of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod: any = await import(spec);
      const pdfjs: any = mod?.default ?? mod;
      if (pdfjs?.getDocument) return pdfjs;
      lastErr = new Error(`Imported ${spec} but getDocument() missing`);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Unable to import pdfjs-dist from attempts: ${attempts.join(", ")}`);
}

function formatErr(e: unknown) {
  const isDev = process.env.NODE_ENV !== "production";
  if (e instanceof Error) {
    return isDev && e.stack ? `${e.message}\n${e.stack}` : e.message;
  }
  return String(e);
}

type Attempt = {
  method: string;
  ok: boolean;
  error?: string;
};

function envInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    nodeEnv: process.env.NODE_ENV || "",
  };
}

async function rasterizeWithPdfjs(
  pdfBytes: Uint8Array,
  page: number,
  density: number,
  createCanvas: (w: number, h: number) => any
): Promise<Uint8Array> {
  const pdfjs = await importPdfjs();
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, disableWorker: true });
  const pdf = await loadingTask.promise;
  const pageCount = Number(pdf?.numPages ?? 0);

  if (!Number.isFinite(page) || page < 1 || (pageCount > 0 && page > pageCount)) {
    throw new Error(`Invalid page. PDF has ${pageCount} pages.`);
  }

  const p = await pdf.getPage(page);
  const scale = density / 72;
  const viewport = p.getViewport({ scale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  await p.render({ canvasContext: ctx, viewport }).promise;
  const png = canvas.toBuffer("image/png");
  return new Uint8Array(png);
}

async function tryMagick(templatePath: string, page: number, density: number): Promise<Uint8Array> {
  try {
    await execFileAsync("magick", ["-version"], { windowsHide: true });
  } catch {
    throw new Error(
      "ImageMagick not found. Install it and ensure `magick` is on PATH (or rely on pdfjs + canvas instead)."
    );
  }

  const tmpPdf = path.join(
    os.tmpdir(),
    `pds-template-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`
  );
  await writeFile(tmpPdf, await readFile(templatePath));

  try {
    const index = Math.max(0, page - 1);
    const input = `${tmpPdf}[${index}]`;
    const { stdout } = await execFileAsync(
      "magick",
      [
        "-density",
        String(density),
        input,
        "-alpha",
        "remove",
        "-alpha",
        "off",
        "png:-",
      ],
      { encoding: "buffer" as any, maxBuffer: 1024 * 1024 * 50, windowsHide: true }
    );
    const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    if (!buf || buf.length === 0) throw new Error("ImageMagick returned empty output");
    return new Uint8Array(buf);
  } finally {
    await unlink(tmpPdf).catch(() => null);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const template = String(url.searchParams.get("template") || "").trim();
  const page = Number(url.searchParams.get("page") || "1");
  const density = Math.max(120, Math.min(400, Number(url.searchParams.get("density") || "220")));

  if (!template) return new NextResponse("Missing template", { status: 400 });
  if (!Number.isFinite(page) || page < 1) return new NextResponse("Invalid page", { status: 400 });

  // Currently only supports the official 2025 template.
  if (template !== "2025") {
    return new NextResponse("Unsupported template", { status: 400 });
  }

  const templatePath = path.join(
    process.cwd(),
    "public",
    "guides",
    "CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf"
  );

  let bytes: Buffer;
  try {
    bytes = await readFile(templatePath);
  } catch {
    return new NextResponse(`Template PDF not found at: ${templatePath}`, { status: 404 });
  }

  const pdfBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const attempts: Attempt[] = [];

  // Prefer: pdfjs-dist + a canvas implementation that works on Windows.
  // 1) @napi-rs/canvas
  try {
    const napi = await import("@napi-rs/canvas");
    const png = await rasterizeWithPdfjs(pdfBytes, page, density, napi.createCanvas);
    attempts.push({ method: "pdfjs-dist + @napi-rs/canvas", ok: true });
    return new NextResponse(Buffer.from(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600, immutable",
      },
    });
  } catch (e) {
    attempts.push({ method: "pdfjs-dist + @napi-rs/canvas", ok: false, error: formatErr(e) });
  }

  // 2) ImageMagick (magick) only if installed
  try {
    const png = await tryMagick(templatePath, page, density);
    attempts.push({ method: "magick (ImageMagick)", ok: true });
    return new NextResponse(Buffer.from(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600, immutable",
      },
    });
  } catch (e) {
    attempts.push({ method: "magick (ImageMagick)", ok: false, error: formatErr(e) });
  }

  const diag = {
    ok: false,
    endpoint: "/api/pds/template-image",
    params: { template, page, density },
    templatePath,
    env: envInfo(),
    attempts,
  };

  return new NextResponse(JSON.stringify(diag, null, 2), {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
