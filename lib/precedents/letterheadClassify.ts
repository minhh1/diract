// lib/precedents/letterheadClassify.ts
// Smart letterhead field detection: reads every paragraph of an uploaded
// letterhead and asks the model which semantic role (if any) each one
// plays, so real placeholder text ("[insert]", "[By Hand/By Email/By Post]",
// a static "Our Ref: MH: 23002x" line, a hardcoded signoff block) gets
// turned into a merge tag AT ITS OWN POSITION -- instead of
// lib/precedents/letterheadTag.ts's blind append-3-tags-at-the-end, which
// only makes sense for a letterhead that's just logo/header art with no
// real structure of its own. Used by app/api/precedents/letterhead/route.ts
// right before that existing fallback (which still runs afterward as a
// safety net for address/content/signoff, so a classification failure never
// breaks an upload).
import PizZip from "pizzip";
import { callHostedModelWithTools } from "@/lib/ai/modelCall";

export const ROLES = [
  "our_ref", "date", "delivery_mode", "recipient_name", "address",
  "salutation", "subject", "body", "signoff", "closing",
] as const;
export type Role = typeof ROLES[number];

export interface ExtractedParagraph {
  index: number;
  text: string;
  bold: boolean;
}

export interface Classification {
  index: number;
  role: Role;
  options?: string[];
}

export interface DetectedField {
  role: string;
  options?: string[];
}

export interface LetterheadTagKeys {
  addressTagKey: string;
  contentTagKey: string;
  signoffTagKey: string;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

export function extractParagraphs(docxBytes: Buffer): ExtractedParagraph[] {
  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return [];
  const xml = docFile.asText();
  const matches = [...xml.matchAll(PARA_RE)];
  return matches.map((m, index) => ({
    index,
    text: m[0].replace(/<[^>]+>/g, "").trim(),
    bold: /<w:b\s*\/>|<w:b\s+[^>]*>/.test(m[0]),
  }));
}

const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classify_letterhead_paragraphs",
    description:
      "Classify which paragraphs of a business's Word letterhead/document template play which semantic role, so the app can turn placeholder text into merge tags at the right spot instead of a generic catch-all at the end of the document.",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          description:
            "One entry per paragraph that plays a recognizable role. Skip purely decorative/blank paragraphs (logo art, plain spacing) with no role. 'closing' and 'signoff' are reported even though they're already correct static text (not brackets/placeholders) -- e.g. a real 'Yours faithfully,' line, or a hardcoded name/title/company/phone/email block -- so the app knows that content already exists and won't add a duplicate.",
          items: {
            type: "object",
            properties: {
              index: { type: "number", description: "The paragraph's index from the numbered list given in the prompt." },
              role: { type: "string", enum: [...ROLES] },
              options: {
                type: "array",
                items: { type: "string" },
                description:
                  "delivery_mode ONLY: split that paragraph's own bracket list into its separate wordings, e.g. \"[By Hand/By Email/By Post]\" -> [\"By Hand\", \"By Email\", \"By Post\"].",
              },
            },
            required: ["index", "role"],
          },
        },
        blankLineAfter: {
          type: "array",
          items: { type: "number" },
          description:
            "Indices of paragraphs that should have a blank paragraph inserted immediately after them, for readability. Only list an index when that separation is clearly missing AND the paragraph right after it is NOT already blank -- never list one whose next paragraph is already blank, and never insert separation inside a single block that belongs together (e.g. within a multi-line mailing address, or between a subject heading and its own detail lines).",
        },
      },
      required: ["fields"],
    },
  },
};

const SYSTEM_PROMPT = `You are analysing a business's uploaded Word letterhead/document template, broken into numbered paragraphs (some blank, some marked [bold]). Bracketed text like [insert] or [By Hand/By Email/By Post] marks a placeholder that hasn't been filled in yet -- these almost always indicate one of the roles below. A blank run of several consecutive paragraphs after the salutation, before any closing/signoff, is the letter's body. Call classify_letterhead_paragraphs exactly once with every paragraph that plays a role:
- our_ref: an internal reference line, e.g. "Our Ref: ..."
- date: the letter's date line (often a Word DATE field)
- delivery_mode: a bracketed list of delivery methods, e.g. "[By Hand/By Email/By Post]"
- recipient_name: the addressee's name or company name
- address: the rest of the recipient's postal address block (Attention line, street, suburb, state, postcode) -- can span several consecutive paragraphs
- salutation: the "Dear ..." line
- subject: the letter's subject/RE heading -- can span several consecutive paragraphs (e.g. a bold heading plus one or two labeled detail lines)
- body: the blank paragraph(s) where the letter's own content goes
- signoff: the signature block (name, title, company, phone, email) -- whether it's blank placeholders or already a real hardcoded person's details
- closing: the sign-off phrase itself (e.g. "Yours faithfully,")
Separately, business letters conventionally use a blank line to visually separate distinct pieces of information -- e.g. between a reference line and the date, between the date and delivery instructions, between delivery instructions and a recipient's name. Some letterheads pack several of these directly adjacent with no blank line at all. List (in blankLineAfter) the index of every paragraph that's missing this separation from the one right after it -- but never one whose next paragraph is already blank, and never split up a single block that belongs together (e.g. a mailing address's own lines, or a subject heading and its labeled detail lines).
Output ONLY through the tool call. If nothing recognizable is found, call it with an empty fields array.`;

function paragraphsPrompt(paragraphs: ExtractedParagraph[]): string {
  return paragraphs
    .map(p => `${p.index}${p.bold ? " [bold]" : ""}: ${p.text || "(blank)"}`)
    .join("\n");
}

export interface ClassifyResult {
  classifications: Classification[];
  blankLineAfter: number[];
  inputTokens: number;
  outputTokens: number;
}

export async function classifyParagraphs(paragraphs: ExtractedParagraph[], modelId: string): Promise<ClassifyResult> {
  if (!paragraphs.length) return { classifications: [], blankLineAfter: [], inputTokens: 0, outputTokens: 0 };
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: paragraphsPrompt(paragraphs) },
  ];
  const result = await callHostedModelWithTools(modelId, messages, [CLASSIFY_TOOL]);
  const fields = result.toolCall?.arguments?.fields;
  const classifications = Array.isArray(fields)
    ? fields
        .filter((f: any) => Number.isInteger(f?.index) && ROLES.includes(f?.role))
        .map((f: any) => ({
          index: f.index,
          role: f.role as Role,
          options: Array.isArray(f.options) ? f.options.map((o: any) => String(o)).filter(Boolean) : undefined,
        }))
    : [];
  const rawBlankLineAfter = result.toolCall?.arguments?.blankLineAfter;
  const blankLineAfter = Array.isArray(rawBlankLineAfter) ? rawBlankLineAfter.filter((i: any) => Number.isInteger(i)) : [];
  return { classifications, blankLineAfter, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

function parseOptionsFromText(text: string): string[] | undefined {
  const m = text.match(/\[([^\]]+)\]/);
  if (!m) return undefined;
  const parts = m[1].split("/").map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : undefined;
}

// The paragraph's OWN visible run(s) are being replaced entirely, but the
// paragraph mark's rPr (nested inside pPr -- the formatting Word applies to
// text newly typed into an otherwise-empty paragraph) still carries the
// font size/family the firm actually designed this line with, e.g. a
// smaller "Our Ref:" line. Reusing it for the new run (rather than building
// a bare <w:b/>-only rPr from scratch, which silently reset every classified
// line to the document's default font size) is what keeps the tagged line
// looking like the rest of the letterhead.
function rebuildParagraph(originalParaXml: string, newText: string, bold: boolean): string {
  const pPrMatch = originalParaXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  const markRprMatch = pPr.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  let innerRpr = (markRprMatch ? markRprMatch[1] : "")
    .replace(/<w:b\s*\/?>|<w:b\s+[^>]*?\/?>/g, "")
    .replace(/<w:bCs\s*\/?>|<w:bCs\s+[^>]*?\/?>/g, "");
  if (bold) innerRpr = `<w:b/><w:bCs/>${innerRpr}`;
  const rPr = innerRpr ? `<w:rPr>${innerRpr}</w:rPr>` : "";
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r></w:p>`;
}

// A "label: value" paragraph (Our Ref:) keeps its literal label and gets the
// tag appended after the colon; every other role replaces the whole
// paragraph, since the tag's own filled value already reads correctly on its
// own (e.g. resolveSalutation's value already starts with "Dear ").
//
// 'address' used to be in here too, which printed "Attention: 231 Moore
// Street, ..." on every letter from a letterhead whose address block happened
// to start with an Attention line -- an Attention line names a person and
// nothing in the app collects one, so the label is dropped and the mailing
// block stands on its own (see lib/precedents/addressBlock.ts). Letterheads
// uploaded before this change still have the label baked into their stored
// .docx, so it's also stripped at fill time -- see
// lib/precedents/letterLayout.ts.
const KEEP_LABEL_PREFIX_ROLES = new Set<Role>(["our_ref"]);

// Rewrites word/document.xml in place: for each detected role, the FIRST
// (lowest-index) paragraph becomes the tag (or keeps its "Label: " prefix --
// see KEEP_LABEL_PREFIX_ROLES), and every other paragraph in that role's
// group is deleted outright (not just blanked) so no stray placeholder text
// or empty-line gaps remain. 'closing' is detection-only: recorded in
// detectedFields but never mutates the document, since it's already correct.
// 'address'/'body'/'signoff' reuse the letterhead's existing dedicated tag
// columns (passed in as tagKeys) instead of introducing new tag names, so a
// letterhead classified today behaves exactly like one from before this
// module existed wherever it doesn't have anything extra.
export function applyClassification(
  docxBytes: Buffer,
  classifications: Classification[],
  tagKeys: LetterheadTagKeys,
  blankLineAfter: number[] = []
): { bytes: Buffer; detectedFields: DetectedField[] } {
  if (!classifications.length) return { bytes: docxBytes, detectedFields: [] };

  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return { bytes: docxBytes, detectedFields: [] };
  const xml = docFile.asText();
  const matches = [...xml.matchAll(PARA_RE)];

  const byRole = new Map<Role, Classification[]>();
  for (const c of classifications) {
    if (!matches[c.index]) continue; // guard against a hallucinated out-of-range index
    const list = byRole.get(c.role) || [];
    list.push(c);
    byRole.set(c.role, list);
  }

  const detectedFields: DetectedField[] = [];
  const toDelete = new Set<number>();
  const toReplace = new Map<number, string>();

  for (const [role, group] of byRole) {
    const sorted = [...group].sort((a, b) => a.index - b.index);
    const anchor = sorted[0];
    // A paragraph the model grouped into this role but that's actually
    // BLANK is very likely a spacer the firm placed on purpose (e.g. a gap
    // before "Yours faithfully", or between the Our Ref/date/delivery-mode/
    // recipient/address lines) -- the model reasonably lumps an adjacent
    // blank line in with a field it can't otherwise classify, but deleting
    // it as a "duplicate" would silently collapse spacing that was never a
    // duplicate to begin with. Only delete extras that actually contain
    // text (a genuine repeated placeholder line).
    for (let i = 1; i < sorted.length; i++) {
      const idx = sorted[i].index;
      const text = matches[idx][0].replace(/<[^>]+>/g, "").trim();
      if (text) toDelete.add(idx);
    }
    if (role === "closing") { detectedFields.push({ role }); continue; }

    const tagKey = role === "address" ? tagKeys.addressTagKey
      : role === "body" ? tagKeys.contentTagKey
      : role === "signoff" ? tagKeys.signoffTagKey
      : role;

    const anchorMatch = matches[anchor.index][0];
    const anchorText = anchorMatch.replace(/<[^>]+>/g, "");
    const bold = /<w:b\s*\/>|<w:b\s+[^>]*>/.test(anchorMatch);

    let newText: string;
    if (KEEP_LABEL_PREFIX_ROLES.has(role)) {
      const colonIdx = anchorText.indexOf(":");
      newText = colonIdx !== -1 ? `${anchorText.slice(0, colonIdx + 1)} {{${tagKey}}}` : `{{${tagKey}}}`;
    } else {
      newText = `{{${tagKey}}}`;
    }
    toReplace.set(anchor.index, rebuildParagraph(anchorMatch, newText, bold));

    if (role === "address" || role === "body" || role === "signoff") continue; // core roles, not reported in detectedFields
    const options = role === "delivery_mode" ? (anchor.options?.length ? anchor.options : parseOptionsFromText(anchorText)) : undefined;
    detectedFields.push(options ? { role, options } : { role });
  }

  // Which paragraphs need a blank line inserted after them is the model's
  // own call (see classifyParagraphs's blankLineAfter), not a fixed rule
  // about specific roles here -- a letterhead's compact/spaced-out header
  // style varies firm to firm, so this generalizes instead of only ever
  // fixing one exact pattern. Guards against a hallucinated out-of-range
  // index the same way the role classifications above do.
  const insertBlankAfter = new Set(blankLineAfter.filter(i => matches[i]));

  if (!toReplace.size && !toDelete.size && !insertBlankAfter.size) return { bytes: docxBytes, detectedFields };

  let newXml = "";
  let lastEnd = 0;
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = start + m[0].length;
    newXml += xml.slice(lastEnd, start);
    let emitted: string | null = null;
    if (toReplace.has(i)) { emitted = toReplace.get(i)!; newXml += emitted; }
    else if (!toDelete.has(i)) { emitted = m[0]; newXml += emitted; }
    if (emitted && insertBlankAfter.has(i)) {
      const pPrMatch = emitted.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
      newXml += `<w:p>${pPrMatch ? pPrMatch[0] : ""}</w:p>`;
    }
    lastEnd = end;
  });
  newXml += xml.slice(lastEnd);

  zip.file("word/document.xml", newXml);
  return { bytes: zip.generate({ type: "nodebuffer" }), detectedFields };
}
