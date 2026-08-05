// lib/pdf/removeBlankPages.ts
// A page-count bug (an off-by-one in a generator's own pagination, or a
// trailing page LibreOffice adds converting a .docx whose last paragraph
// falls right on a page break) leaves a real blank page in the output --
// this catches it after the fact, working from the finished PDF rather
// than requiring every generator to track its own drawing calls.
//
// "Blank" is decided from the page's own content stream, not by rendering
// it: a stream that never invokes a text-showing, path-painting, shading or
// XObject operator painted nothing, whatever state-setting operators
// (q/Q, cm, rg, w, BT/ET, ...) it otherwise contains. Works whether the
// stream is one this process just built (still an unencoded
// PDFContentStream) or one read back from bytes -- the docx-conversion
// path's PDF, or any generator's own output round-tripped through
// save()/load() -- where it arrives as a PDFRawStream, undecoded, and is
// inflated here if its own Filter says FlateDecode.
import { PDFArray, PDFDocument, PDFName, type PDFStream } from "pdf-lib";
import { inflateSync } from "zlib";

// Real content operators only -- q/Q/cm/rg/RG/w/BT/ET and friends set state
// but never paint anything, so a stream using only those is still blank.
const PAINT_OPERATORS = new Set([
  "Tj", "TJ", "'", "\"", // show text
  "S", "s", "f", "F", "f*", "B", "B*", "b", "b*", // stroke/fill a path
  "sh", // shading pattern
  "Do", // invoke an XObject (image or form, e.g. a letterhead logo)
]);

function decodeStream(stream: PDFStream): Uint8Array {
  const withUnencoded = stream as unknown as { getUnencodedContents?: () => Uint8Array };
  if (typeof withUnencoded.getUnencodedContents === "function") {
    try {
      return withUnencoded.getUnencodedContents();
    } catch {
      // Fall through to the raw-bytes path below.
    }
  }
  const raw = stream.getContents();
  const filter = stream.dict.get(PDFName.of("Filter"));
  if (filter?.toString() === "/FlateDecode") {
    try {
      return new Uint8Array(inflateSync(Buffer.from(raw)));
    } catch {
      return raw;
    }
  }
  return raw;
}

function hasPaintedContent(bytes: Uint8Array): boolean {
  let text = Buffer.from(bytes).toString("latin1");
  // Strip string literals and hex strings before tokenising -- their
  // contents can be arbitrary bytes, including sequences that would
  // otherwise look like an operator, and no operator ever appears inside
  // one. Doesn't track nested unescaped parens in literal strings (a real
  // content-stream lexer would); immaterial here since none of the
  // operators being searched for are likely leftover fragments.
  text = text.replace(/\(([^()\\]|\\.)*\)/g, " ").replace(/<[^<>]*>/g, " ");
  // A PDF operator is a bare keyword token. Unlike ordinary text, operators
  // are routinely NOT separated from surrounding syntax by whitespace --
  // `]TJ` (array-then-show-text) and `Tf[` (set-font-then-open-array) are
  // both valid, common, unspaced PDF content-stream syntax -- so splitting
  // on whitespace alone (as this used to) misses real operators sitting
  // right against a delimiter. PDF delimiters double as token boundaries
  // here the same way whitespace does.
  const tokens = text.split(/[\s[\]{}()<>/%]+/);
  for (const token of tokens) {
    if (PAINT_OPERATORS.has(token)) return true;
  }
  return false;
}

function isPageBlank(page: ReturnType<PDFDocument["getPage"]>): boolean {
  const contents = page.node.Contents();
  if (!contents) return true;

  const streams: PDFStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const obj = contents.lookup(i);
      if (obj && typeof (obj as PDFStream).getContents === "function") streams.push(obj as PDFStream);
    }
  } else {
    streams.push(contents);
  }

  return !streams.some(s => hasPaintedContent(decodeStream(s)));
}

/**
 * Removes every blank page from `pdfDoc` in place, keeping at least one page
 * even if every page turns out to be blank (an empty PDF isn't valid, and a
 * single blank page is a far more honest failure mode to hand back than no
 * file at all). Returns how many pages were removed, purely for logging --
 * callers don't need to act on it.
 */
export function removeBlankPages(pdfDoc: PDFDocument): number {
  let removed = 0;
  for (let i = pdfDoc.getPageCount() - 1; i >= 0; i--) {
    if (pdfDoc.getPageCount() <= 1) break;
    const page = pdfDoc.getPage(i);
    if (isPageBlank(page)) {
      pdfDoc.removePage(i);
      removed++;
    }
  }
  return removed;
}

/** Convenience wrapper for callers that only have finished PDF bytes (the docx->PDF conversion path), not a PDFDocument they built themselves. */
export async function removeBlankPagesFromBytes(bytes: Uint8Array | Buffer): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  removeBlankPages(pdfDoc);
  return pdfDoc.save();
}
