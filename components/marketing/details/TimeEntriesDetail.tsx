"use client";

// The rich deep-dive page for manual "Time entries" -- grounded in the
// real field set on the time-fee-entries table
// (supabase/template_law_firm_seed.sql:214-241): matter, staff, date,
// type, task/activity code (UTBMS), description, rate, duration_hours,
// an auto-computed amount (rate x hours via a real formula field), a
// billable toggle, and status (Draft/Released/Billed/Written Off).
import { Clock, ArrowRight } from "lucide-react";
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
          subheadline="Time entries are a real table like any other in Diract — matter, staff, date, activity code, description, rate and hours — so it reports, filters, and exports exactly like the rest of your data."
        />

        <Section eyebrow="Fields" title="What a time entry actually captures">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Matter, staff member, date, billing type (time-based or fixed fee), a task/activity code, a description, rate,
            hours, and status through your billing workflow (Draft → Released → Billed → Written Off).
          </p>
          <div className={`space-y-2 max-w-sm ${isDark ? "dark" : ""}`}>
            <FieldRow label="Matter" value="2024/0187 — Smith Family Trust" />
            <FieldRow label="Rate" value="$450.00" />
            <FieldRow label="Hours" value="2.4" />
            <FieldRow label="Amount" value="$1,080.00" valid />
            <FieldRow label="Status" value="Released" />
          </div>
        </Section>

        <Section eyebrow="No manual maths" title="Amount is computed, not typed">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Rate × hours is a real formula field, calculated the moment either number changes — no separate step to multiply
            it out, and no risk of the two numbers silently drifting apart.
          </p>
          <Link href="/features/ai-time-entries" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:gap-2.5 transition-all">
            Prefer not to type these by hand? See auto time entries <ArrowRight size={14} />
          </Link>
        </Section>
      </div>
    </section>
  );
}
