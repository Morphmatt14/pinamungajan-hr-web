import fs from "node:fs/promises";
import path from "node:path";

async function importPdfjs() {
  const attempts = [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist/build/pdf.js",
  ];

  let lastErr = null;
  for (const spec of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(spec);
      const pdfjs = mod?.default ?? mod;
      if (pdfjs?.getDocument) return pdfjs;
      lastErr = new Error(`Imported ${spec} but getDocument() missing`);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Unable to import pdfjs-dist");
}

function parseArgs(argv) {
  const args = {
    pdf: "public/guides/CS-Form-No.-212-Revised-2025-Personal-Data-Sheet.pdf",
    page: null,
    density: 250,
    out: null,
    outDir: "public/templates",
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--pdf" && next) {
      args.pdf = next;
      i++;
      continue;
    }
    if (a === "--out" && next) {
      args.out = next;
      i++;
      continue;
    }
    if (a === "--outDir" && next) {
      args.outDir = next;
      i++;
      continue;
    }
    if (a === "--page" && next) {
      args.page = Number(next);
      i++;
      continue;
    }
    if (a === "--density" && next) {
      args.density = Number(next);
      i++;
      continue;
    }
  }

  if (args.page !== null && (!Number.isFinite(args.page) || args.page < 1)) throw new Error("--page must be >= 1");
  if (!Number.isFinite(args.density) || args.density < 30) throw new Error("--density must be >= 30");

  return args;
}

async function main() {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjs = await importPdfjs();

  const args = parseArgs(process.argv.slice(2));

  const cwd = process.cwd();
  const pdfPath = path.isAbsolute(args.pdf) ? args.pdf : path.join(cwd, args.pdf);
  const outDir = path.isAbsolute(args.outDir) ? args.outDir : path.join(cwd, args.outDir);

  const pdfBytes = await fs.readFile(pdfPath);

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true });
  const pdf = await loadingTask.promise;

  const pageCount = Number(pdf?.numPages ?? 0);

  const pagesToWrite =
    args.page === null
      ? Array.from({ length: Math.max(0, Math.min(4, pageCount)) }, (_, i) => i + 1)
      : [args.page];
  for (const page of pagesToWrite) {
    if (page > pageCount) throw new Error(`PDF only has ${pageCount} pages; requested page ${page}`);

    // eslint-disable-next-line no-await-in-loop
    const p = await pdf.getPage(page);
    const scale = args.density / 72;
    const viewport = p.getViewport({ scale });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // eslint-disable-next-line no-await-in-loop
    await p.render({ canvasContext: ctx, viewport }).promise;

    const outPath = args.out
      ? path.isAbsolute(args.out)
        ? args.out
        : path.join(cwd, args.out)
      : path.join(outDir, `pds-2025-page${page}.png`);

    // eslint-disable-next-line no-await-in-loop
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(outPath, canvas.toBuffer("image/png"));
    // eslint-disable-next-line no-console
    console.log(`Wrote: ${outPath}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
