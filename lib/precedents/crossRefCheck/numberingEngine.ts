// lib/precedents/crossRefCheck/numberingEngine.ts
// Computes what number each paragraph in an uploaded .docx actually displays
// -- "clause 5.2", "Recital A", "(a)" -- by simulating the same counters Word
// itself keeps. A cross-reference in the prose ("see clause 5.2") is typed
// text; the number it's supposed to match almost never is -- it comes from
// Word's own multi-level list numbering, which isn't stored anywhere as a
// literal string. Checking a reference means recomputing that number the
// way Word would.
//
// Covers the common case (decimal levels, then letter/roman sub-levels,
// restart-on-parent-increment, one abstractNum per numId). Doesn't attempt
// custom restart overrides, legacy Word 2003 numbering, or numbering fields
// inside tables -- real documents mostly don't need those, and getting the
// common case right matters more than covering every corner.
import type { DocParagraph } from "./documentModel";

export interface LevelDef {
  numFmt: string;
  lvlText: string;
  start: number;
}

export interface AbstractNumDef {
  levels: Map<number, LevelDef>;
  /**
   * Set when this abstractNum carries no <w:lvl> of its own and instead
   * points at a numbering *style* for them (w:numStyleLink) -- Word does
   * this when a list is created from its list gallery rather than typed by
   * hand. `levels` is empty in that case; resolve via numbering styles
   * (parseNumberingStyles) to find the numId that actually has them.
   */
  numStyleLink?: string;
}

export interface NumberingDefs {
  abstractNums: Map<string, AbstractNumDef>;
  numIdToAbstract: Map<string, string>;
}

export function parseNumberingXml(xml: string): NumberingDefs {
  const abstractNums = new Map<string, AbstractNumDef>();
  const absRe = /<w:abstractNum w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  let am: RegExpExecArray | null;
  while ((am = absRe.exec(xml))) {
    const [, abstractNumId, body] = am;
    const levels = new Map<number, LevelDef>();
    const lvlRe = /<w:lvl w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g;
    let lm: RegExpExecArray | null;
    while ((lm = lvlRe.exec(body))) {
      const [, ilvlStr, lvlBody] = lm;
      const numFmt = /<w:numFmt w:val="([^"]+)"/.exec(lvlBody)?.[1] ?? "decimal";
      const lvlText = /<w:lvlText w:val="([^"]*)"/.exec(lvlBody)?.[1] ?? "";
      const start = Number(/<w:start w:val="(\d+)"/.exec(lvlBody)?.[1] ?? "1");
      levels.set(Number(ilvlStr), { numFmt, lvlText, start });
    }
    const numStyleLink = /<w:numStyleLink w:val="([^"]+)"/.exec(body)?.[1];
    abstractNums.set(abstractNumId, { levels, numStyleLink });
  }

  const numIdToAbstract = new Map<string, string>();
  const numRe = /<w:num w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g;
  let nm: RegExpExecArray | null;
  while ((nm = numRe.exec(xml))) {
    const [, numId, body] = nm;
    const abstractId = /<w:abstractNumId w:val="(\d+)"/.exec(body)?.[1];
    if (abstractId) numIdToAbstract.set(numId, abstractId);
  }

  return { abstractNums, numIdToAbstract };
}

/** styleId -> numId, for numbering-type styles (w:type="numbering"), which is what a numStyleLink indirection ultimately points at. */
export function parseNumberingStyles(stylesXml: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<w:style w:type="numbering"[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stylesXml))) {
    const numId = /<w:numId w:val="(\d+)"/.exec(m[2])?.[1];
    if (numId) out.set(m[1], numId);
  }
  return out;
}

/** Follows a numId to the abstractNum that actually has levels, resolving one numStyleLink indirection if needed. */
function resolveAbstractNum(
  numId: string,
  numbering: NumberingDefs,
  numberingStyles: Map<string, string>
): AbstractNumDef | undefined {
  const abstractId = numbering.numIdToAbstract.get(numId);
  const abstract = abstractId ? numbering.abstractNums.get(abstractId) : undefined;
  if (!abstract) return undefined;
  if (!abstract.numStyleLink) return abstract;
  const linkedNumId = numberingStyles.get(abstract.numStyleLink);
  if (!linkedNumId || linkedNumId === numId) return abstract;
  const linkedAbstractId = numbering.numIdToAbstract.get(linkedNumId);
  return (linkedAbstractId ? numbering.abstractNums.get(linkedAbstractId) : undefined) ?? abstract;
}

/** A style's own numId/ilvl, walking basedOn until one declares a numId (mirrors deedDocx.ts's resolveNumbering, for an arbitrary uploaded template rather than our own generated content). */
function styleNumbering(stylesXml: string, styleId: string): { numId: string; ilvl: number } | null {
  let id: string | null = styleId;
  let ilvl: number | null = null;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const escaped: string = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m: RegExpExecArray | null = new RegExp(`<w:style\\b[^>]*w:styleId="${escaped}"[^>]*>([\\s\\S]*?)</w:style>`).exec(stylesXml);
    if (!m) return null;
    const body: string = m[1];
    const numPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(body)?.[1];
    if (numPr) {
      if (ilvl === null) ilvl = Number(/<w:ilvl w:val="(\d+)"/.exec(numPr)?.[1] ?? "0");
      const numId = /<w:numId w:val="(\d+)"/.exec(numPr)?.[1];
      if (numId && numId !== "0") return { numId, ilvl: ilvl ?? 0 };
    }
    id = /<w:basedOn w:val="([^"]+)"/.exec(body)?.[1] ?? null;
  }
  return null;
}

/** A paragraph's own effective numId/ilvl: a direct w:numPr overrides the style's, and numId="0" explicitly turns numbering off even if the style has some. */
function paragraphNumbering(pPrXml: string, styleId: string | null, stylesXml: string): { numId: string; ilvl: number } | null {
  const directNumPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(pPrXml)?.[1];
  if (directNumPr) {
    const numId = /<w:numId w:val="(\d+)"/.exec(directNumPr)?.[1];
    const ilvl = Number(/<w:ilvl w:val="(\d+)"/.exec(directNumPr)?.[1] ?? "0");
    if (numId === "0" || numId === undefined) return null;
    return { numId, ilvl };
  }
  return styleId ? styleNumbering(stylesXml, styleId) : null;
}

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case "lowerLetter": return toAlpha(n).toLowerCase();
    case "upperLetter": return toAlpha(n).toUpperCase();
    case "lowerRoman": return toRoman(n).toLowerCase();
    case "upperRoman": return toRoman(n).toUpperCase();
    case "decimalZero": return String(n).padStart(2, "0");
    default: return String(n);
  }
}

// Word doesn't overflow z into a spreadsheet-style aa/ab/ac -- it repeats
// the 27th item's letter twice (aa), the 28th's twice (bb), and so on: item
// 37 is "kk" (the 11th letter, doubled), confirmed against a real document
// with a list that long.
function toAlpha(n: number): string {
  const reps = Math.floor((n - 1) / 26) + 1;
  const letter = String.fromCharCode(97 + ((n - 1) % 26));
  return letter.repeat(reps);
}

function toRoman(n: number): string {
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) { out += sym; v -= val; }
  }
  return out;
}

/**
 * The reference-able form of a numbered paragraph's position: decimal levels
 * dot-joined ("5.2"), then any letter/roman sub-levels appended in whatever
 * bracketing their own lvlText uses ("5.2(a)(i)"), or run straight on for a
 * bare lettered level with no brackets (a Recital's "A").
 */
function cleanNumber(ilvl: number, counters: (number | null)[], levels: Map<number, LevelDef>): string {
  const decimalPath: string[] = [];
  let suffix = "";
  for (let l = 0; l <= ilvl; l++) {
    const val = counters[l];
    if (val == null) continue;
    const lvl = levels.get(l);
    const fmt = lvl?.numFmt ?? "decimal";
    const formatted = formatNumber(val, fmt);
    const parenWrapped = /\(%\d+\)/.test(lvl?.lvlText ?? "");
    if (parenWrapped) suffix += `(${formatted})`;
    else decimalPath.push(formatted);
  }
  return decimalPath.join(".") + suffix;
}

export interface NumberedParagraph {
  index: number;
  text: string;
  styleId: string | null;
  number: string | null;
}

/**
 * Walks every paragraph in body order and computes its displayed number, the
 * same way Word does: a level's counter increments each time a paragraph at
 * that level is numbered, and every deeper level resets (to its own start
 * value, not to zero) whenever that happens. Paragraphs with no numbering
 * get `number: null`.
 */
export function computeNumbering(
  paragraphs: DocParagraph[],
  stylesXml: string,
  numbering: NumberingDefs,
  numberingStyles: Map<string, string> = new Map()
): NumberedParagraph[] {
  const counters = new Map<string, (number | null)[]>();
  const results: NumberedParagraph[] = [];

  // A sub-list ((a), (b), ...) is very often its OWN numId in real
  // documents -- a separate list instance nested under a clause purely by
  // indentation, not by being a deeper ilvl of the clause's own numId. Read
  // in isolation that numId has no decimal part of its own, so it needs the
  // enclosing clause's path prepended: "9.1" + "(a)" -> "9.1(a)". Tracking
  // the most recently seen decimal path and prepending it to any bare
  // letter/roman result gets this right without needing to know the two
  // lists are related -- and leaves recitals (bare letters with no decimal
  // clause seen yet) untouched, since the tracked path is still empty then.
  let currentDecimalPath = "";

  for (const p of paragraphs) {
    const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p.xml);
    const pPr = pPrMatch ? pPrMatch[1] : "";

    const ref = paragraphNumbering(pPr, p.styleId, stylesXml);
    let number: string | null = null;
    if (ref) {
      const abstract = resolveAbstractNum(ref.numId, numbering, numberingStyles);
      if (abstract) {
        let c = counters.get(ref.numId);
        if (!c) { c = new Array(9).fill(null); counters.set(ref.numId, c); }
        const lvlDef = abstract.levels.get(ref.ilvl);
        const start = lvlDef?.start ?? 1;
        c[ref.ilvl] = c[ref.ilvl] == null ? start : (c[ref.ilvl] as number) + 1;
        for (let l = ref.ilvl + 1; l < 9; l++) c[l] = null;
        const own = cleanNumber(ref.ilvl, c, abstract.levels);
        if (/^\d/.test(own)) {
          currentDecimalPath = own;
          number = own;
        } else {
          number = currentDecimalPath + own;
        }
      }
    }

    results.push({ index: p.index, text: p.text, styleId: p.styleId, number });
  }

  return results;
}
