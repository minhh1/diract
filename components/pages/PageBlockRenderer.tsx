// components/pages/PageBlockRenderer.tsx
// The single trusted rendering path for company_pages.blocks -- used
// identically by the Settings builder's live preview (authenticated,
// pre-save editor state) and the public/unauthenticated page view
// (app/(app)/public/pages/[slug]/page.tsx), so preview always matches what
// actually gets published.
//
// Every text field renders via plain JSX interpolation ({block.text}),
// never dangerouslySetInnerHTML -- React escapes it automatically, so
// there's no HTML/script parser anywhere in this component for injected
// markup to run inside, regardless of what a block's text contains. The
// only fields that become real DOM attributes (image src, button href) are
// already scheme-validated by lib/pages/validateBlocks.ts before they ever
// reach this component, and are re-guarded here too (empty/invalid string
// just means "don't render the element" rather than emitting `src=""` or
// `href=""`, since an empty href/src can itself cause the browser to
// re-request the current page).
import React from "react";
import type { PageBlock, NonColumnsBlock } from "@/lib/pages/blockTypes";
import type { ResolvedPageBlock } from "@/lib/pages/resolveRecordBlocks";

const SPACER_HEIGHT: Record<"sm" | "md" | "lg", string> = { sm: "h-4", md: "h-8", lg: "h-16" };

// Shared by record_list (a child table's records related to the page's
// primary matter) and matter_list (the page's own additional linked
// matters) -- identical shape once resolved, just a different real-world
// source.
function RecordTable({ title, fields, rows, emptyLabel }: {
  title: string;
  fields: { id: string; label: string }[];
  rows: Record<string, string>[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      {title && <p className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50">{title}</p>}
      {fields.length === 0 || rows.length === 0 ? (
        <p className="px-4 py-4 text-slate-400 text-sm">{emptyLabel}</p>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {fields.map((f) => (
                <th key={f.id} className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                {fields.map((f) => (
                  <td key={f.id} className="px-3 py-2.5 text-slate-700 text-sm">{row[f.id] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BlockView({ block }: { block: ResolvedPageBlock }) {
  switch (block.type) {
    case "heading": {
      // Never h1 -- the page's own title already renders as the page's one
      // h1 above every block (see blockTypes.ts's HeadingBlock comment).
      const Tag = (`h${block.level}` as unknown) as "h2" | "h3";
      const sizeClass = block.level === 2 ? "text-2xl" : "text-xl";
      return <Tag className={`${sizeClass} font-bold text-slate-900`}>{block.text}</Tag>;
    }
    case "paragraph":
      return <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{block.text}</p>;
    case "image":
      return block.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external firm-provided URLs, not a local/optimizable asset
        <img src={block.url} alt={block.alt} className="max-w-full rounded-2xl" />
      ) : null;
    case "button":
      return block.url ? (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-5 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          {block.label}
        </a>
      ) : (
        <span className="inline-block px-5 py-2.5 rounded-full bg-slate-200 text-slate-500 text-sm font-semibold">{block.label}</span>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "list":
      return block.style === "number" ? (
        <ol className="list-decimal list-inside space-y-1 text-slate-700">
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      ) : (
        <ul className="list-disc list-inside space-y-1 text-slate-700">
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 border-indigo-300 pl-4 italic text-slate-600">
          <p>{block.text}</p>
          {block.attribution && <footer className="mt-1 text-sm not-italic text-slate-400">{block.attribution}</footer>}
        </blockquote>
      );
    case "spacer":
      return <div className={SPACER_HEIGHT[block.size]} />;
    case "columns":
      return (
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(block.columns.length, 1)}, minmax(0, 1fr))` }}>
          {block.columns.map((col, i) => (
            <div key={i} className="space-y-4">
              {col.map((child) => <BlockView key={child.id} block={child} />)}
            </div>
          ))}
        </div>
      );
    case "record_field":
      return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{block.label}</p>
          <p className="text-slate-800 mt-0.5">{block.resolvedValue || "Not available"}</p>
        </div>
      );
    case "record_list":
      return <RecordTable title={block.title} fields={block.resolvedFields} rows={block.resolvedRows} emptyLabel="No related records to show." />;
    case "matter_list":
      return <RecordTable title={block.title} fields={block.resolvedFields} rows={block.resolvedRows} emptyLabel="No linked matters to show." />;
    default:
      return null;
  }
}

export function PageBlocks({ blocks }: { blocks: ResolvedPageBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block) => <BlockView key={block.id} block={block} />)}
    </div>
  );
}

export type { PageBlock, NonColumnsBlock };
