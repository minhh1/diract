"use client";

// The rich deep-dive page for "Template marketplace" -- grounded directly
// in app/(app)/dashboard/marketplace/page.tsx: browse and install templates
// any company has published (install_company_template, see
// supabase/template_marketplace.sql), start a sandbox trial of one first
// (create_trial_sandbox_company, see the startTrial handler), or publish
// your own tables and dashboards as a template for others (see the
// "Publish to marketplace" action in CustomTableBuilder.tsx and
// SchemaVisualisation.tsx).
import { Store, FlaskConical, Share2 } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const MarketplaceMockup = MOCKUPS.marketplace;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Template marketplace",
  headlineLine1: "A starting point for any business,",
  headlineLine2: "not just the ones we built for.",
  subheadline: "Install a ready-made set of tables, fields, and dashboards, or publish your own for other companies to use. The marketplace already spans more than one industry, and any company can add to it.",
  sections: [
    {
      key: "browse",
      eyebrow: "Browse",
      title: "Install what fits, skip what doesn't",
      body: ["Every published template lists what it adds before you touch anything. You choose which tables, fields, and dashboards to bring in, and the same review screen shows you an upgrade later if the template changes."],
    },
    {
      key: "try",
      eyebrow: "Try it",
      title: "A sandbox before you commit",
      body: ["You do not have to install a template on your real company to see whether it fits. One click spins up a separate sandbox company with the template already installed and loaded with sample data, so you can explore it before deciding."],
    },
    {
      key: "publish",
      eyebrow: "Publish",
      title: "Turn your own setup into a template",
      body: ["If you have built a table or a dashboard that works well, you can publish it as a template of your own. It stays a draft until you choose to publish it, and other companies can install it the same way you would install anyone else's."],
    },
  ],
};

export default function MarketplaceDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Store}
          badgeText={copy.badgeText}
          badgeClass="bg-emerald-50 border-emerald-100 text-emerald-600"
          headlineLines={[copy.headlineLine1, copy.headlineLine2]}
          accentClass="text-emerald-600"
          subheadline={copy.subheadline}
        />

        <Section eyebrow={copy.sections[0].eyebrow} eyebrowClass="text-emerald-500" title={copy.sections[0].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[0].body[0]}
          </p>
          <div className={isDark ? "dark" : ""}><MarketplaceMockup /></div>
        </Section>

        <Section eyebrow={copy.sections[1].eyebrow} eyebrowClass="text-emerald-500" title={copy.sections[1].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[1].body[0]}
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <FlaskConical size={14} className="text-emerald-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Try it, loaded with sample data</span>
          </div>
        </Section>

        <Section eyebrow={copy.sections[2].eyebrow} eyebrowClass="text-emerald-500" title={copy.sections[2].title}>
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            {copy.sections[2].body[0]}
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <Share2 size={14} className="text-emerald-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Publish your own tables and dashboards</span>
          </div>
        </Section>
      </div>
    </section>
  );
}
