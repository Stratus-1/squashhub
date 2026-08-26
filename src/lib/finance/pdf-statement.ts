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

/**
 * Extract text from a PDF file. `onProgress` reports 0..1 during OCR, which
 * can take several seconds per page.
 */
export async function extractPdfText(
  file: File | Blob,
  onProgress?: (pct: number, stage: "text" | "ocr") => void,
): Promise<PdfExtractResult> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = doc.numPages;

  const lines: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items as any[]));
    onProgress?.(p / pages, "text");
  }

  const text = lines.join("\n");
  // Heuristic: a real statement text layer has plenty of digits.
  const digits = (text.match(/\d/g) || []).length;
  if (text.trim().length > 200 && digits > 40) {
    return { text, source: "text", pages };
  }

  // ---- OCR fallback for scanned statements ----
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const ocrLines: string[] = [];
  try {
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 }); // ~150dpi, good for OCR
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const { data: res } = await worker.recognize(canvas);
      ocrLines.push(res.text || "");
      onProgress?.(p / pages, "ocr");
    }
  } finally {
    await worker.terminate();
  }

  return { text: ocrLines.join("\n"), source: "ocr", pages };
}

export const isPdfFile = (file: File) =>
  /\.pdf$/i.test(file.name) || file.type === "application/pdf";
