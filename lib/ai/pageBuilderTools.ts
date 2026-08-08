// lib/ai/pageBuilderTools.ts
// Tool schema for lib/ai/pageGenerate.ts's page-content generation. A single
// tool, mirroring lib/ai/tableBuilderTools.ts's add_widget in spirit (one
// flat properties bag covering every block type's fields, disambiguated by
// `type` + description text -- deeply nested per-type JSON Schema branching
// isn't worth it here since this schema is a strong hint to the model, not
// the actual security boundary. lib/pages/validateBlocks.ts is -- every
// field returned by the model is re-validated/coerced/capped there before
// it's ever stored or rendered, regardless of what this schema says.
import { PAGE_BLOCK_TYPES } from "@/lib/pages/blockTypes";
import type { ToolSchema } from "./modelCall";

const BLOCK_ITEM_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: [...PAGE_BLOCK_TYPES] },
    level: { type: "number", enum: [2, 3], description: "heading only: section heading level. The page's title is already shown as its own top-level heading above your content, so never use 1 here -- 2 for a major section, 3 for a sub-point within one." },
    text: { type: "string", description: "heading/paragraph/quote only: the block's text." },
    url: { type: "string", description: "image/button only: a real http(s) URL. Never invent one -- only use a URL the user actually gave you." },
    alt: { type: "string", description: "image only: short alt text describing the image." },
    label: { type: "string", description: "button only: the button's clickable text." },
    style: { type: "string", enum: ["bullet", "number"], description: "list only: bullet or numbered." },
    items: { type: "array", items: { type: "string" }, description: "list only: each item's text." },
    attribution: { type: "string", description: "quote only, optional: who said it." },
    size: { type: "string", enum: ["sm", "md", "lg"], description: "spacer only: vertical gap size." },
    columns: {
      type: "array",
      description: "columns only: 2 or 3 columns laid out side by side, each an array of blocks (any type except columns) in that column, top to bottom.",
      items: { type: "array", items: { type: "object" } },
    },
  },
  required: ["type"],
};

export const PAGE_BUILDER_TOOLS: ToolSchema[] = [
  {
    name: "set_page_blocks",
    description:
      "Lay out this page's full content as an ordered list of blocks, top to bottom. Call this exactly once with the COMPLETE page, not incrementally. Only include fields relevant to each block's own type.",
    input_schema: {
      type: "object",
      properties: {
        blocks: { type: "array", items: BLOCK_ITEM_SCHEMA, description: "The page's full content, in display order." },
      },
      required: ["blocks"],
    },
  },
];
