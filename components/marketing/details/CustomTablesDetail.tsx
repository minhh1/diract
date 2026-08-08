"use client";

// The rich deep-dive page for "Custom tables & fields" -- grounded in the
// real field-type union (components/schema/types.ts:6-10,95-117) and
// real table-creation flow (components/CustomTableBuilder.tsx): 15 real
// field types, formula fields, auto-numbering, and genuine from-scratch
// table creation (not just adding fields to 4 fixed system tables) --
// gated so only company admins can create a SHARED table; everyone else
// gets a private one only they can see.
//
// Conditions, relationships and column config sections are grounded the
// same way: conditions in components/clientUpdatePages/GroupConditionModal.tsx
// and the delete guard in app/api/client-update-pages/[id]/fields/[fieldId]/route.ts;
// relationships in components/schema/FieldConfigPanel.tsx (target table +
// allow_multiple) and lib/hooks/useTableRelations.ts (the reverse panel);
// column config in lib/hooks/useTableColumnConfig.ts and
// lib/hooks/scopedDefaultView.ts (person > team > company priority).
import { Table2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const CustomTableMockup = MOCKUPS.customTable;

const FIELD_TYPES = [
  "Text", "Number", "Date", "Yes/No", "Dropdown", "Link record", "Auto ID", "Email",
  "URL", "Currency", "Property", "Entity", "Project", "Relation", "ABN", "ACN",
];

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Custom tables & fields",
  headlineLine1: "A real table from scratch,",
  headlineLine2: "not a field bolted onto one.",
  subheadline: "Build brand new tables, not just extra fields on the four you started with. There are 15 real field types, conditions, relationships and per-user column layouts, all without writing any code.",
  sections: [
    { key: "board", eyebrow: "Board", title: "Your data, your columns", body: [] },
    {
      key: "field-types",
      eyebrow: "Field types",
      title: "15 real types, not a generic text box",
      body: [`Some fields don't need typing at all. A formula field can multiply two others, take a percentage, or sum/max a related table automatically. An auto-numbered field can generate its own ID from a pattern like {YY}/{MM}.`],
    },
    {
      key: "conditions",
      eyebrow: "Conditions",
      title: "Records sort themselves",
      body: [`A board can be grouped into subgroups you drag records into by hand, or you can set a condition instead: pick a dropdown field and the value it needs to equal, and every matching record lands in that subgroup on its own, with dragging switched off for it. Try to delete a field a condition depends on and it's blocked outright, rather than quietly leaving the condition pointing at nothing.`],
    },
    {
      key: "relationships",
      eyebrow: "Relationships",
      title: "Linked from either side",
      body: [`A relation field points at another table, a single record by default, or a genuine many-to-many when you turn on "allow linking to multiple records." It isn't one-directional: the table on the other end of that link automatically shows the matching child records right on its own record, as a live sub-table, with no second field to configure.`],
    },
    {
      key: "column-config",
      eyebrow: "Column config",
      title: "Every column, tuned per person",
      body: ["For every field, choose whether it shows as a real table column, only when a row is expanded, or not at all, then drag columns into the order you actually read them in, and resize them to fit. Layouts resolve person > team > company, so your own tuning wins, a team default catches everyone else on it, and the company-wide layout is the fallback nobody has to think about."],
    },
    {
      key: "access",
      eyebrow: "Access",
      title: "Shared tables need an admin; private tables don't",
      body: ["Anyone can build a table for their own use. Making it visible to the rest of the company needs a company admin, and deleting a shared table someone else relies on goes through an approval request rather than disappearing on the spot."],
    },
  ],
};

export default function CustomTablesDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Table2}
          badgeText={copy.badgeText}
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-indigo-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} title={copy.sections[0].title}>
          <div className={isDark ? "dark" : ""}><CustomTableMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} title={copy.sections[1].title}>
          <div className="flex flex-wrap gap-2 max-w-2xl mb-6">
            {FIELD_TYPES.map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium">{t}</span>
            ))}
          </div>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[1].body[0]}
          </p>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[2].body[0]}
          </p>
        </Section>

        <Section eyebrow={copy.sections[3].eyebrow} title={copy.sections[3].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[3].body[0]}
          </p>
        </Section>

        <Section eyebrow={copy.sections[4].eyebrow} title={copy.sections[4].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[4].body[0]}
          </p>
        </Section>

        <Section eyebrow={copy.sections[5].eyebrow} title={copy.sections[5].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[5].body[0]}
          </p>
          <Link href="/features/reporting-dashboards" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:gap-2.5 transition-all">
            Once the table&apos;s built, put it on a dashboard <ArrowRight size={14} />
          </Link>
        </Section>
      </div>
    </section>
  );
}
