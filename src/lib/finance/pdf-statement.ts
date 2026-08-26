/**
 * PDF bank statement extraction.
 *
 * 1. Tries the PDF's embedded text layer (fast, exact) via pdf.js.
 * 2. Falls back to OCR (tesseract.js) for scanned / image-only statements.
 *
 * Both libraries are imported lazily so they never land in the main bundle.
 */

export type PdfExtractResult = {
  text: string;
  /** "text" = embedded text layer, "ocr" = rendered + OCR'd */
  source: "text" | "ocr";
  pages: number;
};

async function getPdfjs() {
  const pdfjs: any = await import("pdfjs-dist");
  // Worker is bundled by Vite as a module worker
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/** Reconstruct visual lines from pdf.js text items using their y-position. */
function itemsToLines(items: any[]): string[] {
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const it of items) {
    const str = typeof it?.str === "string" ? it.str : "";
    if (!str.trim()) continue;
    const t = it.transform || [];
    const y = Math.round((t[5] ?? 0) / 3) * 3; // 3pt tolerance
    const x = t[4] ?? 0;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push({ x, s: str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(" ")
        .replace(/\s{3,}/g, "  ")
        .trim(),
    )
    .filter(Boolean);
}

/** A page's text layer is only usable if it has real rows of digits. */
function looksUsable(pageLines: string[]): boolean {
  const text = pageLines.join("\n");
  const digits = (text.match(/\d/g) || []).length;
  const moneyRows = (text.match(/\d[.,]\d{2}(\s|$)/g) || []).length;
  return text.trim().length > 120 && digits > 30 && moneyRows >= 2;
}

/** Render a page to a high-res, grey-scaled + contrast-stretched canvas for OCR. */
async function renderForOcr(page: any): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 3 }); // ~216dpi — noticeably better OCR
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g > 176 ? 255 : g < 96 ? 0 : g; // stretch contrast, keep anti-aliasing mid-tones
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  } catch {
    /* tainted canvas / unsupported — OCR the raw render */
  }
  return canvas;
}

/**
 * Extract text from a PDF file. `onProgress` reports 0..1 during OCR, which
 * can take several seconds per page.
 *
 * Text layer and OCR are decided **per page**, so a statement that mixes a
 * digital first page with scanned continuation pages is fully read.
 */
export async function extractPdfText(
  file: File | Blob,
  onProgress?: (pct: number, stage: "text" | "ocr") => void,
): Promise<PdfExtractResult> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = doc.numPages;

  const perPage: { lines: string[]; usable: boolean }[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = itemsToLines(content.items as any[]);
    perPage.push({ lines, usable: looksUsable(lines) });
    onProgress?.(p / pages, "text");
  }

  const needOcr = perPage.map((p, i) => (p.usable ? -1 : i + 1)).filter((n) => n > 0);
  if (!needOcr.length) {
    return { text: perPage.flatMap((p) => p.lines).join("\n"), source: "text", pages };
  }

  // ---- OCR fallback for the pages without a usable text layer ----
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_char_whitelist:
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,-/()*#&: ",
      preserve_interword_spaces: "1",
    });
    let done = 0;
    for (const p of needOcr) {
      const page = await doc.getPage(p);
      const canvas = await renderForOcr(page);
      const { data: res } = await worker.recognize(canvas);
      perPage[p - 1].lines = (res.text || "").split(/\r?\n/);
      canvas.width = canvas.height = 0; // release memory
      done += 1;
      onProgress?.(done / needOcr.length, "ocr");
    }
  } finally {
    await worker.terminate();
  }

  return {
    text: perPage.flatMap((p) => p.lines).join("\n"),
    source: needOcr.length === pages ? "ocr" : "text",
    pages,
  };
}

export const isPdfFile = (file: File) =>
  /\.pdf$/i.test(file.name) || file.type === "application/pdf";
