// Copies pdfjs-dist's wasm/ and standard_fonts/ asset directories into
// public/pdfjs/ so they're served as plain static files. pdf.js needs these
// at runtime (via the wasmUrl/standardFontDataUrl options in lib/pdfeditor/loadPdf.ts)
// to decode JBIG2/JPEG2000-compressed images (common in scanned PDF pages)
// and to substitute system fonts for non-embedded ones — without them those
// pages/fonts silently degrade rather than erroring loudly. Run automatically
// on install (see package.json's postinstall) so this stays in sync whenever
// pdfjs-dist is upgraded.
import { cpSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const pairs = [
  ["node_modules/pdfjs-dist/wasm", "public/pdfjs/wasm"],
  ["node_modules/pdfjs-dist/standard_fonts", "public/pdfjs/standard_fonts"],
];

for (const [src, dest] of pairs) {
  const srcPath = path.join(root, src);
  const destPath = path.join(root, dest);
  if (!existsSync(srcPath)) {
    console.warn(`copy-pdfjs-assets: ${src} not found, skipping`);
    continue;
  }
  mkdirSync(destPath, { recursive: true });
  cpSync(srcPath, destPath, { recursive: true });
}
console.log("copy-pdfjs-assets: done");
