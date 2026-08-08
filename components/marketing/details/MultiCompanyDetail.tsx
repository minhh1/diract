"use client";

// The rich deep-dive page for "Multi-company" -- grounded in the real
// switcher (components/Sidebar.tsx:1272-1345): a popover off the account
// avatar, listing every company a user belongs to with a 2-letter
// initials avatar and their role there. Switching updates the active
// company and takes you straight to the dashboard -- described honestly
// here as a company switch, not an "instant" in-place swap.
import { Building2 } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const MultiCompanyMockup = MOCKUPS.multiCompany;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Multi-company",
  headlineLine1: "One login,",
  headlineLine2: "every company you belong to.",
  subheadline: "Every company you're a member of, listed from your own account menu. Pick one, and you land straight in that company's own dashboard, its own data, its own settings.",
  sections: [
    {
      key: "switching",
      eyebrow: "Switching",
      title: "Every company you belong to, one click away",
      body: ["Each company shows with your role there, so you always know which hat you're wearing before you click."],
    },
  ],
};

export default function MultiCompanyDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Building2}
          badgeText={copy.badgeText}
          badgeClass="bg-sky-50 border-sky-100 text-sky-700"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-sky-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-sky-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={isDark ? "dark" : ""}><MultiCompanyMockup /></div>
        </Section>
      </div>
    </section>
  );
}
