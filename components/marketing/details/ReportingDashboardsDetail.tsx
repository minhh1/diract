"use client";

// The rich deep-dive page for "Reporting & dashboards" -- grounded in the
// real widget catalogue (lib/dashboardWidgets/types.ts:388-397) and the
// two real authoring modes in components/dashboard/DashboardBuilderPage.tsx
// -- a visual drag/resize canvas, or a text-based DSL for the same widget
// array. Purpose-built widgets (trust ledger, LEDES export, residual land
// solver, etc.) are real, not generic placeholders.
import { BarChart3, LayoutGrid, Code2 } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const ReportingMockup = MOCKUPS.reporting;

const WIDGETS = [
  "Chart", "Summary tile", "Grid", "Quick add form", "Filter bar",
  "Trust ledger statement", "Trust reconciliation", "LEDES export",
  "Time & fees report", "Auto time recording button", "My tasks button",
  "Finance model search", "Residual land solver",
];

export default function ReportingDashboardsDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={BarChart3}
          badgeText="Reporting & dashboards"
          badgeClass="bg-emerald-50 border-emerald-100 text-emerald-700"
          headlineLines={["Built from real widgets,", "not a fixed set of charts."]}
          accentClass="text-emerald-600"
          subheadline="A dashboard here is genuinely custom-built — pick a table, then arrange from a real catalogue of widgets, some as general as a chart, some as specific as a trust reconciliation."
        />

        <Section eyebrow="Dashboard" eyebrowClass="text-emerald-500" title="Your data, your layout">
          <div className={isDark ? "dark" : ""}><ReportingMockup /></div>
        </Section>

        <Section eyebrow="Widgets" eyebrowClass="text-emerald-500" title="A real catalogue, not four chart types">
          <div className="flex flex-wrap gap-2 max-w-2xl">
            {WIDGETS.map((w) => (
              <span key={w} className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium">{w}</span>
            ))}
          </div>
        </Section>

        <Section eyebrow="Building it" eyebrowClass="text-emerald-500" title="Drag it into place, or write it as code">
          <div className="flex gap-3 max-w-sm">
            <div className="flex-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <LayoutGrid size={14} className="text-emerald-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Canvas</span>
            </div>
            <div className="flex-1 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Code2 size={14} className="text-emerald-500 shrink-0" />
              <span className="text-[12px] font-medium text-slate-700">Code</span>
            </div>
          </div>
        </Section>
      </div>
    </section>
  );
}
