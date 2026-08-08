"use client";

// The rich deep-dive page for "Auto-add rules" -- reuses the real mockup
// (components/clientUpdatePages/AutoAddRulesModal.tsx), plus the real
// caveat straight from the modal's own copy: it only applies to new
// records going forward, never retroactively.
import { Workflow } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const AutomationMockup = MOCKUPS.automation;

// Default copy, used whenever nothing's been published from Admin ->
// Landing pages yet (see app/(marketing)/features/[slug]/page.tsx) --
// also the seed source for that page's draft content.
export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Auto-add rules",
  headlineLine1: "A rule in plain English,",
  headlineLine2: "not a workflow diagram.",
  subheadline: "A field, a condition, a value. Set it once and every new record that matches gets added to the right board on its own.",
  sections: [
    { key: "rules", eyebrow: "Rules", title: "Read exactly like you'd say it out loud", body: [] },
    {
      key: "scope",
      eyebrow: "Scope",
      title: "Forward-looking, on purpose",
      body: ["A rule only ever applies to records created after it's set. It never silently reshuffles what's already on the board when you add or change one."],
    },
  ],
};

export default function AutoAddRulesDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Workflow}
          badgeText={copy.badgeText}
          badgeClass="bg-violet-50 border-violet-100 text-violet-600"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-violet-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-violet-500" title={copy.sections[0].title}>
          <div className={isDark ? "dark" : ""}><AutomationMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-violet-500" title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            {copy.sections[1].body[0]}
          </p>
        </Section>
      </div>
    </section>
  );
}
