"use client";

// The rich deep-dive page for "Auto-add rules" -- reuses the real mockup
// (components/clientUpdatePages/AutoAddRulesModal.tsx), plus the real
// caveat straight from the modal's own copy: it only applies to new
// records going forward, never retroactively.
import { Workflow } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const AutomationMockup = MOCKUPS.automation;

export default function AutoAddRulesDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Workflow}
          badgeText="Auto-add rules"
          badgeClass="bg-violet-50 border-violet-100 text-violet-600"
          headlineLines={["A rule in plain English,", "not a workflow diagram."]}
          accentClass="text-violet-600"
          subheadline="A field, a condition, a value — set once and every new record that matches gets added to the right board on its own."
        />

        <Section eyebrow="Rules" eyebrowClass="text-violet-500" title="Read exactly like you'd say it out loud">
          <div className={isDark ? "dark" : ""}><AutomationMockup /></div>
        </Section>

        <Section eyebrow="Scope" eyebrowClass="text-violet-500" title="Forward-looking, on purpose">
          <p className="text-[15px] text-slate-500 leading-relaxed">
            A rule only ever applies to records created after it's set — it never silently reshuffles what's already on the
            board when you add or change one.
          </p>
        </Section>
      </div>
    </section>
  );
}
