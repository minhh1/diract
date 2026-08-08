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
] as const;
export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

interface BaseBlock {
  id: string;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  level: 1 | 2 | 3;
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
  | DividerBlock | ListBlock | QuoteBlock | SpacerBlock;

export type PageBlock = NonColumnsBlock | ColumnsBlock;
