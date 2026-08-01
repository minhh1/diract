import type { PDFFont } from "pdf-lib";

// Word-wraps text to fit a column width instead of truncating it with an
// ellipsis -- trust reports are compliance records (who paid what, for what
// reason, on which matter); silently cutting off the end of a description
// loses information a firm might actually need later, so every trust report
// PDF wraps long cells across multiple lines within the row instead of
// clipping them. Falls back to a hard character break only for a single
// word wider than the column itself (an unbroken long payee name/URL/etc.),
// so nothing overflows the column even in that edge case.
export function wrapPdfText(raw: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const text = (raw || '').trim();
  if (!text) return [''];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushHardBroken = (word: string) => {
    let chunk = '';
    for (const ch of word) {
      const next = chunk + ch;
      if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) { lines.push(current); current = ''; }
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      current = pushHardBroken(word);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
