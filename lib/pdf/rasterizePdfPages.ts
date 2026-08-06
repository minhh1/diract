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
// pdf.js's Node fake-worker setup falls back to a runtime `import("./pdf.worker.mjs")`
// with a plain string specifier -- not statically analyzable, so Vercel's
// file tracer never bundles that chunk into the deployed function and it
// 404s there (despite working locally, where the full node_modules tree is
// on disk). Populating globalThis.pdfjsWorker via a real static import is
// pdf.js's own documented escape hatch for bundlers that can't trace the
// dynamic path -- it short-circuits the runtime import entirely.
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import path from "node:path";
(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

// unpdf's Node defaults (useSystemFonts: true, disableFontFace: true) end up
// never loading ANY font for the PDF's Standard-14 fonts (Helvetica etc.) --
// disableFontFace skips pdf.js's OS-font-substitution path entirely, so
// glyphs silently render as nothing rather than throwing (confirmed live:
// text vanished, vector-drawn lines on the same page rendered fine). Passing
// standardFontDataUrl + useSystemFonts: false makes pdf.js load its own
// bundled substitute glyph data for those fonts instead, independent of
// whatever fonts (if any) the OS has -- required since Vercel's serverless
// runtime has no fonts installed at all (macOS/most dev machines do, which
// is why this only broke in production). Built from process.cwd() rather
// than require.resolve/import.meta.resolve (unreliable inside Next's
// bundled output) -- matches where next.config.ts's outputFileTracingIncludes
// places the directory in the deployed function.
const STANDARD_FONT_DATA_URL = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + "/";

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
  const pdf = await getDocumentProxy(pdfBytes, {
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
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
