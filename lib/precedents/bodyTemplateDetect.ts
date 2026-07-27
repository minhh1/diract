// lib/precedents/bodyTemplateDetect.ts
// Turns 1+ real past documents uploaded for a precedent (see
// app/api/precedents/[id]/body-template/examples/route.ts) into a reusable
// body template: an ordered list of segments alternating fixed boilerplate
// text and fill-in fields. Unlike lib/precedents/letterheadClassify.ts
// (which classifies whole PARAGRAPHS into structural roles), a field here
// can sit mid-sentence -- "the amount of $50,000" -- so this asks the model
// to reconstruct the letter as a flat sequence of text/field segments
// instead of tagging paragraph indices.
//
// The output feeds buildBodyFromTemplate() to produce a plain body string --
// the same shape app/api/precedents/[id]/issue/route.ts already accepts from
// a freeform Body textarea -- so nothing downstream of that (composeLetter.ts,
// lib/precedents/contentXml.ts) needs to change.
import { callHostedModelWithTools } from "@/lib/ai/modelCall";

export type BodyTemplateSegment =
  | { type: "text"; text: string }
  | { type: "field"; key: string; label: string; example: string };

export interface BodyTemplate {
  segments: BodyTemplateSegment[];
}

const BUILD_TOOL = {
  type: "function",
  function: {
    name: "build_precedent_body_template",
    description:
      "Reconstruct one canonical version of a precedent document's body as an ordered sequence of segments, alternating fixed boilerplate text and fill-in fields, from one or more real past examples of the same type of document.",
    parameters: {
      type: "object",
      properties: {
        segments: {
          type: "array",
          description:
            "The full body content in reading order. Consecutive segments of the same type should be merged into one.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["text", "field"] },
              text: { type: "string", description: "Required when type is 'text': the fixed wording, worded generically (not copied from just one example if others phrase it differently)." },
              key: { type: "string", description: "Required when type is 'field': a short snake_case identifier, e.g. project_reference, due_date." },
              label: { type: "string", description: "Required when type is 'field': a short human label for a form input, e.g. \"Project Reference\"." },
              example: { type: "string", description: "Required when type is 'field': the actual value this field held in whichever example illustrates it best, used as a placeholder." },
            },
            required: ["type"],
          },
        },
      },
      required: ["segments"],
    },
  },
};

const SYSTEM_PROMPT = `You are analysing real past documents a business has sent, all examples of the SAME type of precedent document, to build a reusable template for future documents of this type.

The letterhead already supplies the date, Our Ref, delivery mode, recipient name/address, salutation, subject line, and closing/signoff separately -- do NOT include any of those in your output, only the substantive body content between the salutation and the closing.

Call build_precedent_body_template exactly once with the body reconstructed as an ordered list of segments:
- A "text" segment is wording that stays the same across examples (or, with only one example, reads as a fixed sentence rather than data) -- keep the actual phrasing.
- A "field" segment is a specific piece of information that varies between examples or is obviously a data point specific to one record: an address, a date, a dollar amount, a name, a reference number, etc. Give it a short snake_case key, a human label, and use the clearest example's actual value as the "example".
- Preserve paragraph breaks in "text" segments using \\n\\n between paragraphs, exactly like the source documents.
- If multiple examples are given, compare them to tell fixed wording apart from what varies -- don't invent a field for something that's actually identical across all examples.
Output ONLY through the tool call.`;

function examplesPrompt(exampleTexts: string[]): string {
  return exampleTexts
    .map((text, i) => `--- Example ${i + 1} ---\n${text}`)
    .join("\n\n");
}

export interface DetectBodyTemplateResult {
  template: BodyTemplate | null;
  inputTokens: number;
  outputTokens: number;
}

export async function detectBodyTemplate(exampleTexts: string[], modelId: string): Promise<DetectBodyTemplateResult> {
  if (!exampleTexts.length) return { template: null, inputTokens: 0, outputTokens: 0 };
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: examplesPrompt(exampleTexts) },
  ];
  const result = await callHostedModelWithTools(modelId, messages, [BUILD_TOOL]);
  const rawSegments = result.toolCall?.arguments?.segments;
  const segments: BodyTemplateSegment[] = Array.isArray(rawSegments)
    ? rawSegments
        .map((s: any): BodyTemplateSegment | null => {
          if (s?.type === "text" && typeof s.text === "string" && s.text.trim()) {
            return { type: "text", text: s.text };
          }
          if (s?.type === "field" && s.key && s.label) {
            return {
              type: "field",
              key: String(s.key).trim(),
              label: String(s.label).trim(),
              example: String(s.example || "").trim(),
            };
          }
          return null;
        })
        .filter((s: BodyTemplateSegment | null): s is BodyTemplateSegment => s !== null)
    : [];

  return {
    template: segments.length ? { segments } : null,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// Concatenates a template's segments into the same kind of plain body
// string a freeform Body textarea would produce -- text segments pass
// through, field segments substitute the caller-provided value.
export function buildBodyFromTemplate(segments: BodyTemplateSegment[], fieldValues: Record<string, string>): string {
  return segments
    .map(s => (s.type === "text" ? s.text : fieldValues[s.key] ?? ""))
    .join("");
}
