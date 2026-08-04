"use client";

// The rich deep-dive page for "Custom tables & fields" -- grounded in the
// real field-type union (components/schema/types.ts:6-10,95-117) and
// real table-creation flow (components/CustomTableBuilder.tsx): 15 real
// field types, formula fields, auto-numbering, and genuine from-scratch
// table creation (not just adding fields to 4 fixed system tables) --
// gated so only company admins can create a SHARED table; everyone else
// gets a private one only they can see.
import { Table2 } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const CustomTableMockup = MOCKUPS.customTable;

const FIELD_TYPES = [
  "Text", "Number", "Date", "Yes/No", "Dropdown", "Link record", "Auto ID", "Email",
  "URL", "Currency", "Property", "Entity", "Project", "Relation", "ABN", "ACN",
];

export default function CustomTablesDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Table2}
          badgeText="Custom tables & fields"
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={["A real table from scratch,", "not a field bolted onto one."]}
          accentClass="text-indigo-600"
          subheadline="Build brand new tables, not just extra fields on the four you started with — 15 real field types, computed formulas, and auto-numbering, all without writing any code."
        />

        <Section eyebrow="Board" title="Your data, your columns">
          <div className={isDark ? "dark" : ""}><CustomTableMockup /></div>
        </Section>

        <Section eyebrow="Field types" title="15 real types, not a generic text box">
          <div className="flex flex-wrap gap-2 max-w-2xl mb-6">
            {FIELD_TYPES.map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium">{t}</span>
            ))}
          </div>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            Some fields don't need typing at all — a formula field can multiply two others, take a percentage, or sum/max a
            related table automatically. An auto-numbered field can generate its own ID from a pattern like {"{YY}/{MM}"}.
          </p>
        </Section>

        <Section eyebrow="Access" title="Shared tables need an admin; private tables don't">
          <p className="text-[15px] text-slate-500 leading-relaxed">
            Anyone can build a table for their own use. Making it visible to the rest of the company needs a company admin —
            and deleting a shared table someone else relies on goes through an approval request rather than disappearing on
            the spot.
          </p>
        </Section>
      </div>
    </section>
  );
}
