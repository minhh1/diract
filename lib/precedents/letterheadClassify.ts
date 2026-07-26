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
      "Classify which paragraphs of a firm's Word letterhead/letter template play which semantic role, so the app can turn placeholder text into merge tags at the right spot instead of a generic catch-all at the end of the document.",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          description:
            "One entry per paragraph that plays a recognizable role. Skip purely decorative/blank paragraphs (logo art, plain spacing) with no role. 'closing' and 'signoff' are reported even though they're already correct static text (not brackets/placeholders) -- e.g. a real 'Yours faithfully,' line, or a hardcoded name/position/firm/phone/email block -- so the app knows that content already exists and won't add a duplicate.",
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
      },
      required: ["fields"],
    },
  },
};

const SYSTEM_PROMPT = `You are analysing a law firm's uploaded Word letterhead/letter template, broken into numbered paragraphs (some blank, some marked [bold]). Bracketed text like [insert] or [By Hand/By Email/By Post] marks a placeholder the firm hasn't filled in yet -- these almost always indicate one of the roles below. A blank run of several consecutive paragraphs after the salutation, before any closing/signoff, is the letter's body. Call classify_letterhead_paragraphs exactly once with every paragraph that plays a role:
- our_ref: a firm/matter reference line, e.g. "Our Ref: ..."
- date: the letter's date line (often a Word DATE field)
- delivery_mode: a bracketed list of delivery methods, e.g. "[By Hand/By Email/By Post]"
- recipient_name: the addressee's name or company name
- address: the rest of the recipient's postal address block (Attention line, street, suburb, state, postcode) -- can span several consecutive paragraphs
- salutation: the "Dear ..." line
- subject: the letter's subject/RE heading -- can span several consecutive paragraphs (e.g. a bold heading plus one or two labeled detail lines)
- body: the blank paragraph(s) where the letter's own content goes
- signoff: the signature block (name, position, firm, phone, email) -- whether it's blank placeholders or already a real hardcoded person's details
- closing: the sign-off phrase itself (e.g. "Yours faithfully,")
Output ONLY through the tool call. If nothing recognizable is found, call it with an empty fields array.`;

function paragraphsPrompt(paragraphs: ExtractedParagraph[]): string {
  return paragraphs
    .map(p => `${p.index}${p.bold ? " [bold]" : ""}: ${p.text || "(blank)"}`)
    .join("\n");
}

export interface ClassifyResult {
  classifications: Classification[];
  inputTokens: number;
  outputTokens: number;
}

export async function classifyParagraphs(paragraphs: ExtractedParagraph[], modelId: string): Promise<ClassifyResult> {
  if (!paragraphs.length) return { classifications: [], inputTokens: 0, outputTokens: 0 };
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
  return { classifications, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

function parseOptionsFromText(text: string): string[] | undefined {
  const m = text.match(/\[([^\]]+)\]/);
  if (!m) return undefined;
  const parts = m[1].split("/").map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : undefined;
}

function rebuildParagraph(originalParaXml: string, newText: string, bold: boolean): string {
  const pPrMatch = originalParaXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  const rPr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r></w:p>`;
}

// A "label: value" paragraph (Our Ref:, Attention:) keeps its literal label
// and gets the tag appended after the colon; every other role replaces the
// whole paragraph, since the tag's own filled value already reads correctly
// on its own (e.g. resolveSalutation's value already starts with "Dear ").
const KEEP_LABEL_PREFIX_ROLES = new Set<Role>(["our_ref", "address"]);

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
  tagKeys: LetterheadTagKeys
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
    for (let i = 1; i < sorted.length; i++) toDelete.add(sorted[i].index);
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

  if (!toReplace.size && !toDelete.size) return { bytes: docxBytes, detectedFields };

  let newXml = "";
  let lastEnd = 0;
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = start + m[0].length;
    newXml += xml.slice(lastEnd, start);
    if (toReplace.has(i)) newXml += toReplace.get(i);
    else if (!toDelete.has(i)) newXml += m[0];
    lastEnd = end;
  });
  newXml += xml.slice(lastEnd);

  zip.file("word/document.xml", newXml);
  return { bytes: zip.generate({ type: "nodebuffer" }), detectedFields };
}
