import { ArrowRight } from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Hero from "@/components/marketing/Hero";
import FeatureSpotlight from "@/components/marketing/FeatureSpotlight";
import { audienceNavLinks } from "@/lib/marketing/audiences";
import { HOME_FEATURES } from "@/lib/marketing/homeFeatures";
import { MockupThemeProvider, MockupThemeToggle } from "@/components/marketing/MockupThemeProvider";


const steps = [
  { n: "01", title: "Model your process", body: "Define the tables, fields, and statuses that match how your business actually runs." },
  { n: "02", title: "Bring your team in", body: "Invite your team, assign roles, and start working from one shared source of truth." },
  { n: "03", title: "Stay in sync", body: "Everyone sees the same up-to-date picture, in the app and in their inbox." },
];

export default function HomePage() {
  return (
    <MockupThemeProvider>
    <div className="min-h-screen bg-white text-slate-900 antialiased select-text">
      <MarketingNav audienceLinks={audienceNavLinks()} />
      <MockupThemeToggle />

      <Hero
        badge="A CRM that adapts to your business"
        headlineLines={["Built around your process,", "not the other way around."]}
        subheadline="Diract is a configurable CRM platform. You plug in the tables, fields, and workflows your business actually runs on, and manage everything from one place."
        primaryCta={{ href: "/login", label: "Get started" }}
        visual="customTable"
      />

      <FeatureSpotlight
        eyebrow="Everything your business needs"
        heading="A CRM built around your tables, not a template"
        features={HOME_FEATURES}
      />

      {/* How it works */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">How it works</p>
          <h2 className="text-center text-3xl md:text-4xl font-light tracking-tight text-slate-900 mb-16">
            Up and running in minutes
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.n} className="rounded-[24px] border border-slate-100 p-7">
                <span className="text-[13px] font-bold text-indigo-300">{s.n}</span>
                <h3 className="text-[15px] font-semibold text-slate-800 mt-3 mb-2">{s.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gmail add-on callout -- a minor feature next to the rest of the
          platform, so it's a small mention down here rather than a
          headline spotlight row. */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto relative bg-indigo-600 rounded-[40px] px-12 py-16 text-center overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
          <h2 className="relative text-3xl font-light text-white tracking-tight mb-4">Also works right inside Gmail</h2>
          <p className="relative text-indigo-200 text-base leading-relaxed mb-8 max-w-lg mx-auto">
            Assign emails to records, create records, and manage labels without ever leaving your inbox. Labels sync across your whole team within minutes.
          </p>
          <a href="https://workspace.google.com/marketplace" target="_blank" rel="noopener noreferrer"
            className="relative inline-flex items-center gap-2 px-7 py-3.5 bg-white text-indigo-600 text-sm font-medium rounded-full hover:bg-indigo-50 transition-colors">
            Install Gmail Add-on <ArrowRight size={16} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
    </MockupThemeProvider>
  );
}
