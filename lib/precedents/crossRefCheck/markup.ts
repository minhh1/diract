// lib/precedents/crossRefCheck/markup.ts
// Writes the check's findings back into the document itself: the offending
// text highlighted, with a real Word comment (visible in Word's comments
// pane, not just an inline note) explaining what's wrong. Author is the
// checking firm's own name, not a generic "System" -- this is a solicitor's
// markup of a document, and should read like one.
import PizZip from "pizzip";
import type { DocParagraph } from "./documentModel";
import { extractParagraphs } from "./documentModel";

export interface MarkupIssue {
  paragraphIndex: number;
  /** Offset into the paragraph's plain text where the flagged span starts. */
  charOffset: number;
  /** Length of the flagged span, in plain-text characters. */
  length: number;
  commentText: string;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface RunInfo {
  rStart: number;
  rEnd: number;
  rPr: string;
  decodedText: string;
}

/** Every <w:r> in a paragraph that has a <w:t> -- runs with no text (a lone tab or line break) don't contribute to the plain-text offsets markup is given, so they're left alone. */
function findRuns(paragraphXml: string): RunInfo[] {
  const runs: RunInfo[] = [];
  const rRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = rRe.exec(paragraphXml))) {
    const rXml = m[0];
    const tMatch = /<w:t\b[^>]*>([^<]*)<\/w:t>/.exec(rXml);
    if (!tMatch) continue;
    const rPrMatch = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(rXml);
    runs.push({
      rStart: m.index,
      rEnd: m.index + rXml.length,
      rPr: rPrMatch ? rPrMatch[0] : "",
      decodedText: decodeXmlEntities(tMatch[1]),
    });
  }
  return runs;
}

/** Adds a highlight to an existing <w:rPr>...</w:rPr>, or builds one from scratch. */
function withHighlight(rPr: string): string {
  if (!rPr) return "<w:rPr><w:highlight w:val=\"yellow\"/></w:rPr>";
  if (/<w:highlight\b/.test(rPr)) return rPr;
  return rPr.replace("<w:rPr>", "<w:rPr><w:highlight w:val=\"yellow\"/>");
}

function runXml(rPr: string, text: string): string {
  if (!text) return "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/**
 * Highlights [charOffset, charOffset+length) within one paragraph and wraps
 * it in a comment range. Issues are applied last-to-first within the
 * paragraph so earlier offsets stay valid as the XML grows.
 */
function markupParagraph(paragraphXml: string, issues: { charOffset: number; length: number; commentId: number }[]): string {
  let xml = paragraphXml;
  const sorted = [...issues].sort((a, b) => b.charOffset - a.charOffset);

  for (const issue of sorted) {
    const runs = findRuns(xml);
    if (!runs.length) continue;

    let pos = 0;
    const spans = runs.map(r => { const s = pos; pos += r.decodedText.length; return { start: s, end: pos }; });

    const matchStart = issue.charOffset;
    const matchEnd = issue.charOffset + issue.length;
    const firstRunIdx = spans.findIndex(s => matchStart >= s.start && matchStart < s.end);
    const lastRunIdx = spans.findIndex(s => matchEnd > s.start && matchEnd <= s.end);
    if (firstRunIdx < 0 || lastRunIdx < 0) continue;

    const firstRun = runs[firstRunIdx];
    const lastRun = runs[lastRunIdx];
    const prefix = firstRun.decodedText.slice(0, matchStart - spans[firstRunIdx].start);
    const suffix = lastRun.decodedText.slice(matchEnd - spans[lastRunIdx].start);
    // The full matched text, decoded, regardless of how many runs it spans --
    // reconstructed from the runs themselves rather than trusting the
    // caller's own copy, so it's exactly what highlighting will wrap.
    const matchedText = firstRunIdx === lastRunIdx
      ? firstRun.decodedText.slice(matchStart - spans[firstRunIdx].start, matchEnd - spans[firstRunIdx].start)
      : [firstRun.decodedText.slice(matchStart - spans[firstRunIdx].start)]
          .concat(runs.slice(firstRunIdx + 1, lastRunIdx).map(r => r.decodedText))
          .concat([lastRun.decodedText.slice(0, matchEnd - spans[lastRunIdx].start)])
          .join("");

    const replacement =
      runXml(firstRun.rPr, prefix) +
      `<w:commentRangeStart w:id="${issue.commentId}"/>` +
      runXml(withHighlight(firstRun.rPr), matchedText) +
      `<w:commentRangeEnd w:id="${issue.commentId}"/>` +
      `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${issue.commentId}"/></w:r>` +
      runXml(lastRun.rPr, suffix);

    xml = xml.slice(0, firstRun.rStart) + replacement + xml.slice(lastRun.rEnd);
  }

  return xml;
}

function commentsXmlFor(entries: { id: number; author: string; date: string; text: string }[]): string {
  const body = entries
    .map(e =>
      `<w:comment w:id="${e.id}" w:author="${escapeXml(e.author)}" w:date="${e.date}" w:initials="${escapeXml(initials(e.author))}">` +
      `<w:p><w:r><w:t xml:space="preserve">${escapeXml(e.text)}</w:t></w:r></w:p></w:comment>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:comments>`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 4).toUpperCase();
}

function ensureCommentsRelationship(zip: PizZip): void {
  const contentTypesFile = zip.file("[Content_Types].xml");
  const contentTypes = contentTypesFile ? contentTypesFile.asText() : "";
  if (contentTypes && !contentTypes.includes("/word/comments.xml")) {
    const withComments = contentTypes.replace(
      "</Types>",
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`
    );
    zip.file("[Content_Types].xml", withComments);
  }

  const relsPath = "word/_rels/document.xml.rels";
  const relsFile = zip.file(relsPath);
  const rels = relsFile ? relsFile.asText() : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  if (!rels.includes("relationships/comments")) {
    const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map(m => Number(m[1]));
    const nextId = ids.length ? Math.max(...ids) + 1 : 1;
    const withRel = rels.replace(
      "</Relationships>",
      `<Relationship Id="rId${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`
    );
    zip.file(relsPath, withRel);
  }
}

/**
 * Marks up a .docx with one highlight + comment per issue. Issues whose
 * paragraph/offset can no longer be found (shouldn't happen -- markup runs
 * against the same bytes the checks just read) are silently skipped rather
 * than throwing, so one bad issue doesn't take down the whole document.
 */
export function markupDocx(docxBytes: Buffer, issues: MarkupIssue[], authorName: string): Buffer {
  const zip = new PizZip(docxBytes);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("The uploaded file has no document body.");
  let documentXml = documentFile.asText();

  const byParagraph = new Map<number, MarkupIssue[]>();
  for (const issue of issues) {
    const list = byParagraph.get(issue.paragraphIndex) ?? [];
    list.push(issue);
    byParagraph.set(issue.paragraphIndex, list);
  }

  const existingComments = zip.file("word/comments.xml")?.asText() ?? "";
  const existingIds = [...existingComments.matchAll(/<w:comment w:id="(\d+)"/g)].map(m => Number(m[1]));
  let nextCommentId = existingIds.length ? Math.max(...existingIds) + 1 : 0;
  const date = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const commentEntries: { id: number; author: string; date: string; text: string }[] = [];

  // Paragraphs are re-extracted once up front and processed last-to-first by
  // XML offset, so splicing one doesn't invalidate the recorded offsets of
  // paragraphs still to come.
  const paragraphs: DocParagraph[] = extractParagraphs(documentXml);
  const affected = paragraphs.filter(p => byParagraph.has(p.index)).sort((a, b) => b.start - a.start);

  for (const p of affected) {
    const paraIssues = byParagraph.get(p.index) ?? [];
    const withIds = paraIssues.map(issue => {
      const id = nextCommentId++;
      commentEntries.push({ id, author: authorName, date, text: issue.commentText });
      return { charOffset: issue.charOffset, length: issue.length, commentId: id };
    });
    const markedUp = markupParagraph(p.xml, withIds);
    documentXml = documentXml.slice(0, p.start) + markedUp + documentXml.slice(p.end);
  }

  zip.file("word/document.xml", documentXml);

  if (existingComments) {
    const insertion = commentEntries
      .map(e =>
        `<w:comment w:id="${e.id}" w:author="${escapeXml(e.author)}" w:date="${e.date}" w:initials="${escapeXml(initials(e.author))}">` +
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(e.text)}</w:t></w:r></w:p></w:comment>`
      )
      .join("");
    zip.file("word/comments.xml", existingComments.replace("</w:comments>", `${insertion}</w:comments>`));
  } else {
    zip.file("word/comments.xml", commentsXmlFor(commentEntries));
  }

  ensureCommentsRelationship(zip);

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
