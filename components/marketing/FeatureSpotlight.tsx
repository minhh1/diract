"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Table2, Workflow, Building2, ShieldCheck, BarChart3, Clock, Sparkles, Landmark,
  FileText, Users, LayoutPanelLeft, ListChecks, TrendingUp, CalendarClock, Calculator,
  BadgeCheck, ArrowRight, type LucideIcon,
} from "lucide-react";
import { MOCKUPS, type MockupName } from "./mockups";
import { useMockupTheme } from "./MockupThemeProvider";

export type SpotlightAccent = "indigo" | "violet" | "sky" | "emerald" | "amber";

// Icon references can't be passed as props from the (server) page components
// into this client component -- React can't serialize a function across the
// RSC boundary. Pages pass a plain string key instead; the actual component
// is looked up here, entirely client-side.
const ICONS: Record<string, LucideIcon> = {
  Table2, Workflow, Building2, ShieldCheck, BarChart3, Clock, Sparkles, Landmark,
  FileText, Users, LayoutPanelLeft, ListChecks, TrendingUp, CalendarClock, Calculator,
  BadgeCheck,
};
export type SpotlightIconName = keyof typeof ICONS;

export interface SpotlightFeature {
  slug: string;
  icon: SpotlightIconName;
  title: string;
  body: string;
  accent: SpotlightAccent;
  visual: MockupName;
}

// Tailwind v4 needs literal class strings to keep them in the build --
// this is why it's a lookup object instead of `bg-${accent}-100` template
// interpolation.
const ACCENTS: Record<SpotlightAccent, { bg: string; text: string }> = {
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600" },
  violet: { bg: "bg-violet-100", text: "text-violet-600" },
  sky: { bg: "bg-sky-100", text: "text-sky-600" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-600" },
};

function FeatureVisual({ feature }: { feature: SpotlightFeature }) {
  const a = ACCENTS[feature.accent];
  const Mockup = MOCKUPS[feature.visual];
  const isDark = useMockupTheme();
  return (
    <div className={`relative flex items-center justify-center py-4 ${isDark ? "dark" : ""}`}>
      <div className={`absolute -bottom-6 -right-6 w-40 h-40 rounded-full ${a.bg} opacity-60 blur-2xl -z-10`} />
      <Mockup />
    </div>
  );
}

export default function FeatureSpotlight({
  eyebrow,
  heading,
  features,
}: {
  eyebrow: string;
  heading: string;
  features: SpotlightFeature[];
}) {
  return (
    <section className="bg-slate-50 py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">{eyebrow}</p>
          <h2 className="text-3xl md:text-4xl font-light tracking-tight text-slate-900">{heading}</h2>
        </div>

        <div className="space-y-20">
          {features.map((f, i) => {
            const a = ACCENTS[f.accent];
            const Icon = ICONS[f.icon];
            const reversed = i % 2 === 1;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <Link
                  href={`/features/${f.slug}`}
                  className={`group grid md:grid-cols-2 gap-10 items-center ${reversed ? "md:[&>*:first-child]:order-2" : ""}`}
                >
                  <div>
                    <div className={`w-11 h-11 rounded-2xl ${a.bg} flex items-center justify-center mb-5`}>
                      <Icon className={a.text} size={20} strokeWidth={2} />
                    </div>
                    <h3 className="text-xl font-medium text-slate-900 mb-3">{f.title}</h3>
                    <p className="text-[15px] text-slate-500 leading-relaxed max-w-md mb-4">{f.body}</p>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 group-hover:gap-2.5 transition-all">
                      See how it works <ArrowRight size={14} />
                    </span>
                  </div>
                  <FeatureVisual feature={f} />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
