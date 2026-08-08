"use client";

// The rich deep-dive page for "Mass import disbursements" -- grounded
// directly in the real components/dashboard/DisbursementInvoiceImportModal.tsx
// and its backing routes (app/api/disbursements/parse-invoice,
// app/api/disbursements/commit). Available both from the standalone
// Disbursements table's toolbar and from a matter's own Disbursements tab
// (restricted to that one matter).
import { Upload, CopyX, AlertTriangle } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const DisbursementsMockup = MOCKUPS.disbursementsImport;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Mass import disbursements",
  headlineLine1: "One invoice, every matter it bills,",
  headlineLine2: "reviewed before anything is added.",
  subheadline: "A supplier tax invoice, the InfoTrack-style kind covering dozens of searches and certificates across many matters at once, gets read, grouped by matter, and staged for review. Nothing is written until you approve it.",
  sections: [
    {
      key: "review",
      eyebrow: "Review",
      title: "Grouped by matter, editable line by line",
      body: ["Every line item stays editable, from description to expense code to amount, before it becomes a real disbursement."],
    },
    {
      key: "duplicates",
      eyebrow: "Duplicates",
      title: "Flagged, not silently skipped",
      body: ["A line that looks like it's already been recorded, whether the same dealing number, or the same date, description, and amount already on that matter, starts unchecked rather than hidden. A double-billed search is a real accounting error, and opting back in to a genuine coincidence is one click."],
    },
    {
      key: "matching",
      eyebrow: "Matching",
      title: "A matter number that doesn't resolve is never guessed",
      body: ["If a matter number on the invoice doesn't match an existing matter, its charges are still shown, so nothing gets silently left out unexplained, but they can't be committed until a person decides what to do with them."],
    },
  ],
};

export default function DisbursementsImportDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Upload}
          badgeText={copy.badgeText}
          badgeClass="bg-amber-50 border-amber-100 text-amber-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-amber-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={isDark ? "dark" : ""}><DisbursementsMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[1].body[0]}
          </p>
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase w-fit ${isDark ? "dark" : ""}`}>
            <CopyX size={11} /> Possible duplicate
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} eyebrowClass="text-amber-500" title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[2].body[0]}
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">No matching matter, can&apos;t be added</span>
          </div>
        </Section>
      </div>
    </section>
  );
}
