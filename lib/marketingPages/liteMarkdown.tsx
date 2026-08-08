// lib/marketingPages/liteMarkdown.tsx
// Legal text needs inline **bold** (defined terms) and [link](url) markup
// preserved when edited from Admin -> Landing pages, but the rest of this
// CMS deliberately never renders raw HTML from stored content (see
// supabase/migrations/20260808080000_company_pages.sql's own note on that
// -- no dangerouslySetInnerHTML anywhere in the render path). This is the
// same rule applied here: a tiny, fixed two-token markdown subset, parsed
// into real React elements, not a general HTML/markdown renderer. There is
// no path from a stored string to raw markup.
import type { ReactNode } from "react";

// Matches **bold** or [label](https://... | /path | mailto:...) -- nothing
// else. Order matters: bold and links can't nest in this subset.
const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function renderLiteMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const isExternal = /^https?:\/\//.test(match[3]);
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          className="text-indigo-600 hover:underline"
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {match[2]}
        </a>
      );
    }
    lastIndex = TOKEN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
