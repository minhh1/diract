// lib/pages/validateBlocks.ts
// The single choke point every write path for company_pages.blocks goes
// through -- AI tool output (lib/ai/pageGenerate.ts) AND manual saves from
// the block editor (app/api/pages/[id]/route.ts's PUT) -- before it's
// allowed to reach the database or render anywhere. Never trust either
// source directly: a tool-call JSON Schema is a strong hint to the model,
// not a guarantee of what it actually returns, and a browser PUT body is
// ordinary attacker-reachable input like any other API route's.
//
// This function's job is narrow and mechanical on purpose: drop anything
// that isn't in the fixed PAGE_BLOCK_TYPES vocabulary, coerce every
// remaining field to the right primitive type, cap every string/array
// length, and run every URL field through safeHref. It is NOT trying to
// sanitize HTML/script out of free text -- that's unnecessary, because
// nothing downstream (components/pages/PageBlockRenderer.tsx) ever
// interprets a block's text fields as markup in the first place. The
// caps here exist to bound worst-case payload size (a runaway or
// adversarial AI response), not to catch injected code.
import { PAGE_BLOCK_TYPES, type PageBlock, type NonColumnsBlock } from "./blockTypes";
import { safeHref } from "@/lib/safeHref";

const MAX_TOP_LEVEL_BLOCKS = 100;
const MAX_COLUMNS = 3;
const MAX_LIST_ITEMS = 50;
const MAX_SHORT_TEXT = 200; // heading text, button label, image alt
const MAX_LONG_TEXT = 2000; // paragraph/quote text
const MAX_IDENTIFIER = 200; // fieldKey/childTableId/relationFieldId -- internal ids, not prose
const MAX_FIELD_IDS = 6;

// Codebase-wide rule (AGENTS.md): no em dash, double hyphen, or spaced
// hyphen as a separator in AI-generated/user-facing text. The system prompt
// (lib/ai/pageGenerate.ts) already asks the model not to use them, but this
// is the actual guarantee -- a deterministic fallback for whatever slips
// through, same "enforce it, don't just ask" reasoning as heading level 1
// below. Only matches the SPACED/doubled separator forms, so a real
// mid-word hyphen (e.g. "full-service") is untouched.
export function stripBannedSeparators(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/\s*--\s*/g, ", ").replace(/ - /g, ", ");
}

function str(value: unknown, maxLen: number): string {
  return stripBannedSeparators(String(value ?? "")).slice(0, maxLen);
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function id(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw : newId();
}

// For fieldKey/childTableId/relationFieldId -- internal identifiers, not
// display text, so no dash-stripping (str()'s cleanup is for prose).
// Deliberately permissive on an invalid/empty value here (e.g. a field that
// was later deleted) -- resolveRecordBlocks.ts renders a "not available"
// placeholder for anything it can't resolve rather than erroring, so this
// layer only needs to bound size/shape.
function ident(value: unknown): string {
  return String(value ?? "").trim().slice(0, MAX_IDENTIFIER);
}

// allowNesting is false when validating a column's own children -- a column
// can hold any non-"columns" block, but never another "columns" block.
function validateOne(raw: unknown, allowNesting: boolean): PageBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const type = b.type;
  if (typeof type !== "string" || !(PAGE_BLOCK_TYPES as readonly string[]).includes(type)) return null;
  if (type === "columns" && !allowNesting) return null;

  switch (type) {
    case "heading": {
      // level 1 is never valid here (coerced to 2) -- see blockTypes.ts's
      // HeadingBlock comment on why the page title already owns the only H1.
      const level = b.level === 3 ? 3 : 2;
      return { id: id(b.id), type: "heading", level, text: str(b.text, MAX_SHORT_TEXT) };
    }
    case "paragraph":
      return { id: id(b.id), type: "paragraph", text: str(b.text, MAX_LONG_TEXT) };
    case "image":
      return { id: id(b.id), type: "image", url: safeHref(typeof b.url === "string" ? b.url : ""), alt: str(b.alt, MAX_SHORT_TEXT) };
    case "button":
      return { id: id(b.id), type: "button", label: str(b.label, MAX_SHORT_TEXT), url: safeHref(typeof b.url === "string" ? b.url : "") };
    case "divider":
      return { id: id(b.id), type: "divider" };
    case "list": {
      const style = b.style === "number" ? "number" : "bullet";
      const items = Array.isArray(b.items) ? b.items.slice(0, MAX_LIST_ITEMS).map((it) => str(it, MAX_SHORT_TEXT)).filter(Boolean) : [];
      return { id: id(b.id), type: "list", style, items };
    }
    case "quote": {
      const attribution = typeof b.attribution === "string" && b.attribution.trim() ? str(b.attribution, MAX_SHORT_TEXT) : undefined;
      return { id: id(b.id), type: "quote", text: str(b.text, MAX_LONG_TEXT), ...(attribution ? { attribution } : {}) };
    }
    case "spacer": {
      const size = b.size === "sm" || b.size === "lg" ? b.size : "md";
      return { id: id(b.id), type: "spacer", size };
    }
    case "record_field": {
      const fieldSource = b.fieldSource === "custom" ? "custom" : "base";
      return { id: id(b.id), type: "record_field", fieldSource, fieldKey: ident(b.fieldKey), label: str(b.label, MAX_SHORT_TEXT) };
    }
    case "record_list": {
      const fieldIds = Array.isArray(b.fieldIds) ? b.fieldIds.slice(0, MAX_FIELD_IDS).map(ident).filter(Boolean) : [];
      return {
        id: id(b.id), type: "record_list",
        childTableId: ident(b.childTableId), relationFieldId: ident(b.relationFieldId),
        fieldIds, title: str(b.title, MAX_SHORT_TEXT),
      };
    }
    case "matter_list": {
      const rawFields = Array.isArray(b.fields) ? b.fields.slice(0, MAX_FIELD_IDS) : [];
      const fields = rawFields
        .map((f: unknown) => {
          if (!f || typeof f !== "object") return null;
          const fr = f as Record<string, unknown>;
          const fieldKey = ident(fr.fieldKey);
          if (!fieldKey) return null;
          return { fieldSource: fr.fieldSource === "custom" ? "custom" as const : "base" as const, fieldKey, label: str(fr.label, MAX_SHORT_TEXT) };
        })
        .filter((f): f is { fieldSource: "base" | "custom"; fieldKey: string; label: string } => f !== null);
      return { id: id(b.id), type: "matter_list", title: str(b.title, MAX_SHORT_TEXT), fields };
    }
    case "columns": {
      const rawColumns = Array.isArray(b.columns) ? b.columns.slice(0, MAX_COLUMNS) : [];
      const columns: NonColumnsBlock[][] = rawColumns.map((col) =>
        Array.isArray(col)
          ? col.map((child) => validateOne(child, false)).filter((x): x is NonColumnsBlock => x !== null)
          : []
      );
      return { id: id(b.id), type: "columns", columns };
    }
    default:
      return null;
  }
}

export function validateBlocks(input: unknown): PageBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_TOP_LEVEL_BLOCKS)
    .map((raw) => validateOne(raw, true))
    .filter((b): b is PageBlock => b !== null);
}
