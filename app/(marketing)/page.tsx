import { ArrowRight } from "lucide-react";
import MarketingNav from "@/components/marketing/MarketingNav";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Hero from "@/components/marketing/Hero";
import FeatureSpotlight, { type SpotlightFeature } from "@/components/marketing/FeatureSpotlight";

const features: SpotlightFeature[] = [
  {
    icon: "FolderKanban",
    title: "Project management",
    body: "Organise properties, matters, and entities in one place, with custom fields, statuses, and team assignments built around how your firm actually works.",
    accent: "indigo",
  },
  {
    icon: "Mail",
    title: "Gmail integration",
    body: "Assign emails to matters directly from Gmail. No forwarding, no copy-pasting — just label and go.",
    accent: "sky",
  },
  {
    icon: "RefreshCw",
    title: "Automatic sync",
    body: "Labels applied by one team member appear in everyone's Gmail within minutes, so the whole team stays on the same page without manual sharing.",
    accent: "violet",
  },
  {
    icon: "Building2",
    title: "Multi-company",
    body: "Manage multiple entities under one login, and switch between companies instantly without signing out and back in.",
    accent: "emerald",
  },
  {
    icon: "ShieldCheck",
    title: "Role-based access",
    body: "Admins control label settings and source emails while the rest of the team collaborates freely, without stepping on each other's changes.",
    accent: "amber",
  },
  {
    icon: "Puzzle",
    title: "Gmail Add-on",
    body: "Create projects, assign emails, and manage labels directly from the Gmail sidebar — no browser tab switching needed.",
    accent: "indigo",
  },
];

const steps = [
  { n: "01", title: "Connect Gmail", body: "Sign in and connect your firm's Gmail in a couple of clicks — no IT ticket required." },
  { n: "02", title: "Sync your matters", body: "Bring in your existing matters and entities, or start fresh — labels and folders map automatically." },
  { n: "03", title: "Stay in sync", body: "Every teammate sees the same up-to-date picture, whether they're in Diract or in their own inbox." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased select-text">
      <MarketingNav secondaryLink={{ href: "/for/law-firm-au", label: "For law firms" }} />

      <Hero
        badge="Property & Legal Management"
        headlineLines={["Your firm's matters,", "finally in sync."]}
        subheadline="Diract connects your Gmail and project management into one system. Assign emails to matters, sync labels across your team, and keep everyone on the same page."
        primaryCta={{ href: "/login", label: "Get started" }}
        secondaryCta={{ href: "/for/law-firm-au", label: "See it for law firms" }}
      />

      <FeatureSpotlight
        eyebrow="Everything your firm needs"
        heading="Built for the way legal & property teams actually work"
        features={features}
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

      {/* Gmail add-on callout */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto relative bg-indigo-600 rounded-[40px] px-12 py-16 text-center overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
          <h2 className="relative text-3xl font-light text-white tracking-tight mb-4">Works right inside Gmail</h2>
          <p className="relative text-indigo-200 text-base leading-relaxed mb-8 max-w-lg mx-auto">
            The Diract Gmail Add-on lets you create projects, assign emails, and manage labels without ever leaving your inbox.
          </p>
          <a href="https://workspace.google.com/marketplace" target="_blank" rel="noopener noreferrer"
            className="relative inline-flex items-center gap-2 px-7 py-3.5 bg-white text-indigo-600 text-sm font-medium rounded-full hover:bg-indigo-50 transition-colors">
            Install Gmail Add-on <ArrowRight size={16} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
