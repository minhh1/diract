// lib/pdf/rasterizePdfPages.ts
// Server-side PDF -> page images, for feeding a vision model that has no
// native PDF/document input (see lib/genericInvoiceParser.ts). Uses unpdf's
// pdf.js wrapper (pointed at the real pdfjs-dist build already a repo
// dependency, not unpdf's bundled serverless-stub build, which can't
// render) with @napi-rs/canvas as the Node canvas backend -- both pure
// prebuilt-binary/no-system-dependency, safe on Vercel's serverless
// functions (unlike node-canvas/poppler, which need system libcairo /
// poppler-utils that aren't available there).
import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from "unpdf";

let pdfjsModuleReady: Promise<void> | null = null;
function ensurePdfjsModule(): Promise<void> {
  if (!pdfjsModuleReady) {
    // The default pdfjs-dist entry assumes a browser (warns "Please use the
    // legacy build in Node.js environments"); the legacy build is the one
    // built for a plain Node runtime like a Vercel serverless function.
    pdfjsModuleReady = definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
  }
  return pdfjsModuleReady;
}

// A real invoice/receipt is 1-2 pages; capping bounds worst-case cost and
// latency for a stray oversized upload.
const MAX_PAGES = 5;

// Returns each rendered page as a data: URL (base64 PNG), ready to drop
// straight into an OpenAI-compatible `image_url` content block.
export async function rasterizePdfPages(pdfBytes: Uint8Array): Promise<string[]> {
  await ensurePdfjsModule();
  const pdf = await getDocumentProxy(pdfBytes);
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);

  const dataUrls: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const dataUrl = await renderPageAsImage(pdf, i, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 2,
      toDataURL: true,
    });
    dataUrls.push(dataUrl as string);
  }
  return dataUrls;
}
