// lib/precedents/crossRefCheck/detectReferences.ts
// Scans a document's plain text for clause, recital, schedule and annexure
// cross-references, and checks each one against the numbers numberingEngine
// actually computed (clauses/recitals) or against headings found by pattern
// (schedules/annexures aren't usually part of the same auto-numbering run
// as the clauses -- a firm types "Schedule 1" as its own heading).
import type { DocParagraph } from "./documentModel";
import type { NumberedParagraph } from "./numberingEngine";

export interface CrossRefIssue {
  kind: "clause" | "recital" | "schedule" | "annexure";
  /** The exact text matched, e.g. "clause 5.2". */
  referenceText: string;
  /** The specific number token within it that's wrong, e.g. "5.2". */
  token: string;
  paragraphIndex: number;
  /** Offset of `referenceText` within that paragraph's plain text. */
  charOffset: number;
  message: string;
}

const NUMBER_TOKEN = String.raw`\d+(?:\.\d+)*(?:\([a-zA-Z]+\))*`;
const CONNECTOR = String.raw`\s*(?:,|and|to|or)\s*`;
const CLAUSE_RE = new RegExp(String.raw`\bclauses?\s+(${NUMBER_TOKEN}(?:${CONNECTOR}${NUMBER_TOKEN})*)`, "gi");
const RECITAL_RE = /\brecitals?\s+([A-Z](?:\s*(?:,|and)\s*[A-Z])*)\b/gi;
const SCHEDULE_RE = /\bschedules?\s+(\d+|[A-Z])\b/gi;
const ANNEXURE_RE = /\bannexures?\s+(\d+|[A-Z])\b/gi;

function splitList(text: string): string[] {
  return text.split(/\s*(?:,|and|to|or)\s*/i).map(s => s.trim()).filter(Boolean);
}

/** Headings that name a schedule/annexure directly ("Schedule 1", "Annexure B ..."), independent of the main clause numbering. */
function collectNamedHeadings(paragraphs: DocParagraph[], keyword: "Schedule" | "Annexure"): Set<string> {
  const re = new RegExp(`^${keyword}\\s+(\\d+|[A-Z])\\b`, "i");
  const found = new Set<string>();
  for (const p of paragraphs) {
    const m = re.exec(p.text.trim());
    if (m) found.add(m[1].toUpperCase());
  }
  return found;
}

export function detectReferences(paragraphs: DocParagraph[], numbered: NumberedParagraph[]): CrossRefIssue[] {
  const clauseNumbers = new Set(numbered.map(p => p.number).filter((n): n is string => !!n));
  // Recitals are the bare-letter numbered paragraphs (upperLetter, no
  // brackets) -- "A", "B" -- distinct from a lettered sub-clause, which
  // always carries its own parent path or parens ("(a)", "5.2(a)").
  const recitalLetters = new Set(numbered.map(p => p.number).filter((n): n is string => !!n && /^[A-Z]$/.test(n)));
  const schedules = collectNamedHeadings(paragraphs, "Schedule");
  const annexures = collectNamedHeadings(paragraphs, "Annexure");

  const issues: CrossRefIssue[] = [];

  for (const p of paragraphs) {
    const text = p.text;

    for (const m of text.matchAll(CLAUSE_RE)) {
      const referenceText = m[0];
      const listStart = (m.index ?? 0) + m[0].indexOf(m[1]);
      let cursor = listStart;
      for (const token of splitList(m[1])) {
        const tokenOffset = text.indexOf(token, cursor);
        cursor = tokenOffset >= 0 ? tokenOffset + token.length : cursor;
        if (!clauseNumbers.has(token)) {
          issues.push({
            kind: "clause",
            referenceText,
            token,
            paragraphIndex: p.index,
            charOffset: m.index ?? 0,
            message: `"${referenceText}" refers to clause ${token}, but there is no clause numbered ${token} in this document.`,
          });
        }
      }
    }

    for (const m of text.matchAll(RECITAL_RE)) {
      const referenceText = m[0];
      for (const token of splitList(m[1])) {
        if (!recitalLetters.has(token)) {
          issues.push({
            kind: "recital",
            referenceText,
            token,
            paragraphIndex: p.index,
            charOffset: m.index ?? 0,
            message: `"${referenceText}" refers to Recital ${token}, but there is no Recital ${token} in this document.`,
          });
        }
      }
    }

    for (const m of text.matchAll(SCHEDULE_RE)) {
      const token = m[1].toUpperCase();
      if (!schedules.has(token)) {
        issues.push({
          kind: "schedule",
          referenceText: m[0],
          token,
          paragraphIndex: p.index,
          charOffset: m.index ?? 0,
          message: `"${m[0]}" refers to Schedule ${m[1]}, but no heading "Schedule ${m[1]}" was found in this document.`,
        });
      }
    }

    for (const m of text.matchAll(ANNEXURE_RE)) {
      const token = m[1].toUpperCase();
      if (!annexures.has(token)) {
        issues.push({
          kind: "annexure",
          referenceText: m[0],
          token,
          paragraphIndex: p.index,
          charOffset: m.index ?? 0,
          message: `"${m[0]}" refers to Annexure ${m[1]}, but no heading "Annexure ${m[1]}" was found in this document.`,
        });
      }
    }
  }

  return issues;
}
