"use client";

import { motion } from "framer-motion";
import {
  FolderKanban, Mail, RefreshCw, Building2, ShieldCheck, Puzzle,
  Users, ShieldAlert, BadgeCheck, LayoutPanelLeft, type LucideIcon,
} from "lucide-react";

export type SpotlightAccent = "indigo" | "violet" | "sky" | "emerald" | "amber";

// Icon references can't be passed as props from the (server) page components
// into this client component -- React can't serialize a function across the
// RSC boundary. Pages pass a plain string key instead; the actual component
// is looked up here, entirely client-side.
const ICONS: Record<string, LucideIcon> = {
  FolderKanban, Mail, RefreshCw, Building2, ShieldCheck, Puzzle,
  Users, ShieldAlert, BadgeCheck, LayoutPanelLeft,
};
export type SpotlightIconName = keyof typeof ICONS;

export interface SpotlightFeature {
  icon: SpotlightIconName;
  title: string;
  body: string;
  accent: SpotlightAccent;
}

// Tailwind v4 needs literal class strings to keep them in the build --
// this is why it's a lookup object instead of `bg-${accent}-100` template
// interpolation.
const ACCENTS: Record<SpotlightAccent, { bg: string; text: string; ring: string; gradient: string }> = {
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600", ring: "ring-indigo-200", gradient: "from-indigo-200/60 to-indigo-50" },
  violet: { bg: "bg-violet-100", text: "text-violet-600", ring: "ring-violet-200", gradient: "from-violet-200/60 to-violet-50" },
  sky: { bg: "bg-sky-100", text: "text-sky-600", ring: "ring-sky-200", gradient: "from-sky-200/60 to-sky-50" },
  emerald: { bg: "bg-emerald-100", text: "text-emerald-600", ring: "ring-emerald-200", gradient: "from-emerald-200/60 to-emerald-50" },
  amber: { bg: "bg-amber-100", text: "text-amber-600", ring: "ring-amber-200", gradient: "from-amber-200/60 to-amber-50" },
};

function FeatureVisual({ feature }: { feature: SpotlightFeature }) {
  const a = ACCENTS[feature.accent];
  const Icon = ICONS[feature.icon];
  return (
    <div className={`relative aspect-[4/3] w-full rounded-[28px] bg-gradient-to-br ${a.gradient} border border-white/60 flex items-center justify-center overflow-hidden`}>
      <div className={`absolute -bottom-10 -right-10 w-40 h-40 rounded-full ${a.bg} opacity-70 blur-2xl`} />
      <div className={`relative w-20 h-20 rounded-[24px] bg-white shadow-xl flex items-center justify-center ring-4 ${a.ring}`}>
        <Icon className={a.text} size={32} strokeWidth={1.75} />
      </div>
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
                className={`grid md:grid-cols-2 gap-10 items-center ${reversed ? "md:[&>*:first-child]:order-2" : ""}`}
              >
                <div>
                  <div className={`w-11 h-11 rounded-2xl ${a.bg} flex items-center justify-center mb-5`}>
                    <Icon className={a.text} size={20} strokeWidth={2} />
                  </div>
                  <h3 className="text-xl font-medium text-slate-900 mb-3">{f.title}</h3>
                  <p className="text-[15px] text-slate-500 leading-relaxed max-w-md">{f.body}</p>
                </div>
                <FeatureVisual feature={f} />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
