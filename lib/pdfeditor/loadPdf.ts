// Shared pdf.js document loader for the PDF editor. Centralizes the worker
// setup and the wasmUrl/standardFontDataUrl options — without wasmUrl, pdf.js
// can't decode JBIG2/JPEG2000-compressed images (common in scanned pages) and
// those pages silently render blank; without standardFontDataUrl it can't
// substitute a close system font for non-embedded fonts. Both asset sets are
// copied from node_modules/pdfjs-dist into public/pdfjs/ (see package.json's
// postinstall) so they're served as plain static files — simpler and more
// portable than relying on bundler-specific directory asset resolution.
"use client";

export async function loadPdfDocument(data: Uint8Array) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjsLib.getDocument({
    data: data.slice(), // pdf.js may transfer/detach the buffer — callers keep their own copy
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  }).promise;
}
