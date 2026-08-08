// lib/pages/blockTypes.ts
// Fixed vocabulary of content blocks for AI-authored "content pages" (see
// components/settings/ContentPagesTab.tsx, lib/ai/pageGenerate.ts). Modeled
// on lib/dashboardWidgets/types.ts's discriminated-union widget shape.
//
// This vocabulary IS the security boundary for the whole feature: every
// field here is a plain string/number/enum, never rendered as HTML/markdown
// (see components/pages/PageBlockRenderer.tsx, which uses plain JSX text
// interpolation only -- no dangerouslySetInnerHTML anywhere). There is
// nothing in the render path that parses a block's text as markup, so there
// is no code-injection surface to sanitize away in the first place -- unlike
// an approach where the AI emits raw HTML and a sanitizer tries to strip bad
// parts out. See lib/pages/validateBlocks.ts, the single choke point every
// write path (AI tool output and manual editor saves) passes through before
// this shape ever reaches the database.
export const PAGE_BLOCK_TYPES = [
  "heading", "paragraph", "image", "button", "divider", "list", "quote", "columns", "spacer",
  "record_field", "record_list", "matter_list",
] as const;
export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

interface BaseBlock {
  id: string;
}

// level is 2|3 only, never 1 -- the page's own title already renders as the
// page's one H1 above every block (see app/(app)/public/pages/[slug]/page.tsx),
// so a heading block claiming H1 would always be a second, competing
// top-level heading, never a legitimate one. See validateBlocks.ts, which
// enforces this the same way regardless of source (AI or manual edit).
export interface HeadingBlock extends BaseBlock {
  type: "heading";
  level: 2 | 3;
  text: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  text: string;
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  url: string;
  alt: string;
}

export interface ButtonBlock extends BaseBlock {
  type: "button";
  label: string;
  url: string;
}

export interface DividerBlock extends BaseBlock {
  type: "divider";
}

export interface ListBlock extends BaseBlock {
  type: "list";
  style: "bullet" | "number";
  items: string[];
}

export interface QuoteBlock extends BaseBlock {
  type: "quote";
  text: string;
  attribution?: string;
}

export interface SpacerBlock extends BaseBlock {
  type: "spacer";
  size: "sm" | "md" | "lg";
}

// Only meaningful when the page is bound to a matter (company_pages.project_id)
// -- see lib/pages/resolveRecordBlocks.ts, the only place these are ever
// resolved to a real value, always live at render time. This block itself
// never stores the field's actual value -- fieldKey is a REFERENCE, resolved
// fresh on every read, same "never bake a record's value into stored
// content" principle client_update_pages already established
// (lib/clientUpdatePageDetail.ts). fieldSource disambiguates what fieldKey
// actually points at -- mirrors client_update_page_fields.field_source:
// "base" means a real projects column name (e.g. "status"), "custom" means
// a company_custom_fields.id (a uuid, not a literal key).
export interface RecordFieldBlock extends BaseBlock {
  type: "record_field";
  fieldSource: "base" | "custom";
  fieldKey: string;
  label: string;
}

// A capped, read-only table of records from a child table related to the
// bound matter (e.g. every Invoice or Task linked to it) -- relationFieldId
// is the child table's own table_relation field that points back at
// projects, the same linking convention lib/ai/tableBuilderTools.ts's
// sum_related/max_related formulas already use to find "every child row
// pointing at this record." Resolved live, capped at ~20 rows -- see
// resolveRecordBlocks.ts.
export interface RecordListBlock extends BaseBlock {
  type: "record_list";
  childTableId: string;
  relationFieldId: string;
  fieldIds: string[];
  title: string;
}

// A capped, read-only table of the page's ADDITIONAL linked matters
// (company_page_projects, see that migration) -- distinct from record_list,
// which lists a child table's records related to the page's single primary
// matter (company_pages.project_id). matter_list instead lists the matters
// themselves, e.g. every matter the assistant found and linked after being
// asked for "matters with an email from X" (lib/ai/pageBuilderTools.ts's
// search_matters/link_matters). Resolved live, capped at ~50 rows -- see
// resolveRecordBlocks.ts.
export interface MatterListBlock extends BaseBlock {
  type: "matter_list";
  title: string;
  fields: { fieldSource: "base" | "custom"; fieldKey: string; label: string }[];
}

// Nests exactly one level -- a column's own children can never themselves be
// a "columns" block. Enforced by validateBlocks, not just by this type (the
// type system alone doesn't stop a hand-crafted/model-crafted payload from
// nesting arbitrarily deep before validation runs).
export interface ColumnsBlock extends BaseBlock {
  type: "columns";
  columns: NonColumnsBlock[][];
}

export type NonColumnsBlock =
  | HeadingBlock | ParagraphBlock | ImageBlock | ButtonBlock
  | DividerBlock | ListBlock | QuoteBlock | SpacerBlock
  | RecordFieldBlock | RecordListBlock | MatterListBlock;

export type PageBlock = NonColumnsBlock | ColumnsBlock;
