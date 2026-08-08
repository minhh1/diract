// components/legal/RenderLegalSections.tsx
// Shared renderer for app/(marketing)/terms/page.tsx and .../privacy/page.tsx
// -- turns a LegalPageCopy (see lib/marketingPages/publishedContent.ts) into
// the same Section/SubSection/list/JurisdictionTabs structure those pages
// always had, just data-driven instead of hardcoded JSX, so a published
// edit renders identically to a hand-written one.
import { Section, SubSection } from "@/components/legal/LegalPageShell";
import JurisdictionTabs from "@/components/legal/JurisdictionTabs";
import type { Jurisdiction } from "@/lib/legalJurisdiction";
import { renderLiteMarkdown } from "@/lib/marketingPages/liteMarkdown";
import type { LegalPageCopy } from "@/lib/marketingPages/publishedContent";

export default function RenderLegalSections({
  copy, defaultJurisdiction,
}: {
  copy: LegalPageCopy;
  defaultJurisdiction: Jurisdiction;
}) {
  return (
    <>
      {copy.sections.map((section) => (
        <Section key={section.key} title={section.title}>
          {section.body?.map((p, i) => <p key={`body-${i}`}>{renderLiteMarkdown(p)}</p>)}

          {section.kind === "list" && (
            <ul className="list-disc list-inside space-y-1">
              {section.listItems!.map((item, i) => <li key={i}>{renderLiteMarkdown(item)}</li>)}
            </ul>
          )}

          {section.kind === "subsections" &&
            section.subsections!.map((sub, i) => (
              <SubSection key={i} title={sub.title}>
                {sub.body.map((p, j) => <p key={j}>{renderLiteMarkdown(p)}</p>)}
              </SubSection>
            ))}

          {section.kind === "jurisdiction" && (
            <JurisdictionTabs
              defaultJurisdiction={defaultJurisdiction}
              sections={{
                AU: <div className="space-y-3">{section.jurisdiction!.AU.map((p, i) => <p key={i}>{renderLiteMarkdown(p)}</p>)}</div>,
                EU_UK: <div className="space-y-3">{section.jurisdiction!.EU_UK.map((p, i) => <p key={i}>{renderLiteMarkdown(p)}</p>)}</div>,
                US: <div className="space-y-3">{section.jurisdiction!.US.map((p, i) => <p key={i}>{renderLiteMarkdown(p)}</p>)}</div>,
              }}
            />
          )}

          {section.trailingBody?.map((p, i) => (
            <p key={`trailing-${i}`} className={i === 0 ? "mt-4" : undefined}>{renderLiteMarkdown(p)}</p>
          ))}
        </Section>
      ))}
    </>
  );
}
