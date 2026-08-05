"use client";

// The rich deep-dive page for manual "Time entries" -- grounded in the
// real field set on the time-fee-entries table
// (supabase/template_law_firm_seed.sql:214-241): matter, staff, date,
// type, task/activity code (UTBMS), description, rate, duration_hours,
// an auto-computed amount (rate x hours via a real formula field), a
// billable toggle, and status (Draft/Released/Billed/Written Off).
//
// Keyboard section grounded in three real, separate techniques: arrow-key
// option highlighting + Enter/Tab to confirm in relation pickers
// (components/dashboard/RelationPicker.tsx:944-971,1030-1055), a
// first-letter shortcut on select fields scoped to quick-add forms only
// (components/dashboard/FieldValueInput.tsx:138-176, gated behind
// [data-quickadd-fields]), and the entry grid's blank rows becoming real
// records as soon as their required fields are filled
// (components/dashboard/DashboardGrid.tsx:55-59,256-330). There is no
// Excel-style arrow-key cell-to-cell navigation across the grid -- Tab
// moves between cells only via plain browser focus order, not custom code
// -- so this doesn't claim that.
import { Clock, ArrowRight, CornerDownLeft } from "lucide-react";
import Link from "next/link";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { FieldRow } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

export default function TimeEntriesDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Clock}
          badgeText="Time entries"
          badgeClass="bg-indigo-50 border-indigo-100 text-indigo-600"
          headlineLines={["Every field a fee earner", "actually needs, nothing more."]}
          accentClass="text-indigo-600"
          subheadline="Time entries are a real table like any other in Diract, with matter, staff, date, activity code, description, rate and hours, so it reports, filters, and exports exactly like the rest of your data."
        />

        <Section eyebrow="Fields" title="What a time entry actually captures">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Matter, staff member, date, billing type (time-based or fixed fee), a task/activity code, a description, rate,
            hours, and status through your billing workflow (Draft → Released → Billed → Written Off).
          </p>
          <div className={`space-y-2 max-w-sm ${isDark ? "dark" : ""}`}>
            <FieldRow label="Matter" value="2024/0187 — Smith Family Trust" />
            <FieldRow label="Rate" value="$450.00" />
            <FieldRow label="Hours" value="0.3" />
            <FieldRow label="Amount" value="$135.00" valid />
            <FieldRow label="Status" value="Released" />
          </div>
        </Section>

        <Section eyebrow="No manual maths" title="Amount is computed, not typed">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Rate × hours is a real formula field, calculated the moment either number changes. There's no separate step to multiply
            it out, and no risk of the two numbers silently drifting apart.
          </p>
        </Section>

        <Section eyebrow="Keyboard" title="Built to be typed, end to end">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Three real techniques, not a marketing line about "keyboard friendly": arrow keys highlight an option in the
            Matter or Staff picker, and Enter or Tab confirms it. A select field like Type picks itself the instant you press
            its first letter, then jumps you straight to the next field. And the entry grid's blank rows quietly become real
            records the moment their required fields are filled. Keep typing, and keep getting new rows underneath.
          </p>
          <div className={`space-y-2.5 max-w-sm ${isDark ? "dark" : ""}`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Matter</p>
              <div className="space-y-1">
                <div className="rounded-lg bg-indigo-50 px-3 py-1.5 text-[12px] font-medium text-indigo-700">2024/0187 — Smith Family Trust</div>
                <div className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-400">2024/0201 — Nguyen Trust Deed</div>
              </div>
              <p className="flex items-center gap-1 text-[10px] text-slate-400 mt-2 px-1"><CornerDownLeft size={10} /> Enter or Tab to confirm</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-[12px] font-medium text-slate-700">Type</span>
              <span className="text-[11px] font-mono text-slate-400">press "t" → Time Based</span>
            </div>
          </div>
        </Section>

        <Section eyebrow="Automatic" title="Or skip typing them at all">
          <Link href="/features/ai-time-entries" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:gap-2.5 transition-all">
            Prefer not to type these by hand? See auto time entries <ArrowRight size={14} />
          </Link>
        </Section>
      </div>
    </section>
  );
}
