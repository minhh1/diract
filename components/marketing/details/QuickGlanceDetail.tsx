"use client";

// The rich deep-dive page for "Quick Glance" -- grounded directly in
// components/dashboard/quickGlance/LawFirmQuickGlance.tsx (the real landing
// page every law firm user sees after signing in, see the redirects into
// /dashboard/quick-glance across proxy.ts, app/auth/callback/route.ts, and
// app/(marketing)/login/page.tsx) and its two real widgets:
// components/dashboard/TimeAgingReportWidget.tsx (the Times/Matters toggle
// and the real 5/10/15/30-day quick filter) and
// components/dashboard/quickGlance/UnpaidInvoicesWidget.tsx.
import { Gauge, Landmark, Receipt } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const QuickGlanceMockup = MOCKUPS.quickGlance;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Quick Glance",
  headlineLine1: "The first screen after signing in,",
  headlineLine2: "not a blank dashboard.",
  subheadline: "Trust health and unbilled time, both at a glance, before you go find either one yourself. It's the actual landing page a law firm user sees after logging in, not a separate report to go check.",
  sections: [
    {
      key: "trust-health",
      eyebrow: "Trust health",
      title: "Balance, dormant matters, and coverage in three numbers",
      body: ["Total trust balance across every matter, how many matters have gone dormant for 90 days or more, and how many matters are holding trust money at all, computed live from the same ledger the Trust account feature keeps."],
    },
    {
      key: "unbilled-time",
      eyebrow: "Unbilled time",
      title: "Old time doesn't hide until you go looking for it",
      body: ["Every entry not yet invoiced, oldest first. Switch between every individual entry and a per-matter rollup, and narrow to only what's older than 5, 10, 15, or 30 days, the same real filter on the live widget, not a static screenshot of one setting."],
    },
    {
      key: "billing",
      eyebrow: "Billing",
      title: "Unpaid invoices, sorted oldest first",
      body: ["Every issued invoice still sitting unpaid, with how much is outstanding in total. A draft under review isn't counted here, since that's your own work in progress, not money a client actually owes yet."],
    },
  ],
};

export default function QuickGlanceDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Gauge}
          badgeText={copy.badgeText}
          badgeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-emerald-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-emerald-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Landmark size={14} className="text-emerald-600 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Trust balance, dormant trust, matters with trust</span>
          </div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-emerald-500" title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[1].body[0]}
          </p>
          <div className={isDark ? "dark" : ""}><QuickGlanceMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[2].body[0]}
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Receipt size={14} className="text-emerald-600 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Outstanding invoices and total amount due</span>
          </div>
        </Section>
      </div>
    </section>
  );
}
