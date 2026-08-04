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

const MarketplaceMockup = MOCKUPS.marketplace;

export default function MarketplaceDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={Store}
          badgeText="Template marketplace"
          badgeClass="bg-emerald-50 border-emerald-100 text-emerald-600"
          headlineLines={["A starting point for any business,", "not just the ones we built for."]}
          accentClass="text-emerald-600"
          subheadline="Install a ready-made set of tables, fields, and dashboards, or publish your own for other companies to use. The marketplace already spans more than one industry, and any company can add to it."
        />

        <Section eyebrow="Browse" eyebrowClass="text-emerald-500" title="Install what fits, skip what doesn't">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Every published template lists what it adds before you touch anything. You choose which tables, fields,
            and dashboards to bring in, and the same review screen shows you an upgrade later if the template
            changes.
          </p>
          <div className={isDark ? "dark" : ""}><MarketplaceMockup /></div>
        </Section>

        <Section eyebrow="Try it" eyebrowClass="text-emerald-500" title="A sandbox before you commit">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            You do not have to install a template on your real company to see whether it fits. One click spins up a
            separate sandbox company with the template already installed and loaded with sample data, so you can
            explore it before deciding.
          </p>
          <div className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 max-w-md ${isDark ? "dark" : ""}`}>
            <FlaskConical size={14} className="text-emerald-500 shrink-0" />
            <span className="text-[12px] font-medium text-slate-700">Try it, loaded with sample data</span>
          </div>
        </Section>

        <Section eyebrow="Publish" eyebrowClass="text-emerald-500" title="Turn your own setup into a template">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            If you have built a table or a dashboard that works well, you can publish it as a template of your own.
            It stays a draft until you choose to publish it, and other companies can install it the same way you
            would install anyone else's.
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
