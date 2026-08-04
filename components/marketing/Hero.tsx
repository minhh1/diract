"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface HeroProps {
  badge: string;
  headlineLines: [string, string];
  subheadline: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
}

// A stylized, abstract stand-in for a product screenshot -- built entirely
// from CSS/SVG since there are no real screenshots checked into the repo
// to use. Loosely evokes the matter board (status chips + rows) rather
// than any one real screen, so it doesn't go stale as the UI changes.
function MockMatterBoard() {
  const rows = [
    { label: "123 Collins St — Sale", tag: "In progress", color: "bg-indigo-100 text-indigo-600" },
    { label: "Nguyen Family Trust", tag: "Awaiting docs", color: "bg-amber-100 text-amber-600" },
    { label: "Harbord Property Co.", tag: "Settled", color: "bg-emerald-100 text-emerald-600" },
    { label: "45 Bourke St — Lease", tag: "In progress", color: "bg-indigo-100 text-indigo-600" },
  ];
  return (
    <div className="relative rounded-[28px] bg-white border border-slate-100 shadow-[0_32px_64px_-24px_rgba(79,70,229,0.35)] p-5 w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
        </div>
        <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Matters</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-[12px] font-medium text-slate-700 truncate">{r.label}</span>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${r.color}`}>{r.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hero({ badge, headlineLines, subheadline, primaryCta, secondaryCta }: HeroProps) {
  return (
    <section className="relative pt-40 pb-28 px-6 overflow-hidden">
      {/* Soft gradient blobs -- pure CSS, no assets */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute top-10 right-[-120px] w-[420px] h-[420px] rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute bottom-[-160px] left-1/3 w-[380px] h-[380px] rounded-full bg-sky-200/30 blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-[11px] font-medium text-indigo-600 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
            {badge}
          </div>
          <h1 className="text-5xl md:text-6xl font-light tracking-tight text-slate-900 mb-6 leading-[1.05]">
            {headlineLines[0]}<br />
            <span className="text-indigo-600">{headlineLines[1]}</span>
          </h1>
          <p className="text-lg text-slate-500 font-light max-w-xl mb-10 leading-relaxed">
            {subheadline}
          </p>
          <div className="flex items-center gap-4">
            <Link href={primaryCta.href} className="px-7 py-3.5 bg-indigo-600 text-white text-sm font-medium rounded-full hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
              {primaryCta.label}
            </Link>
            {secondaryCta && (
              <Link href={secondaryCta.href} className="px-7 py-3.5 text-slate-500 text-sm hover:text-slate-800 transition-colors">
                {secondaryCta.label} →
              </Link>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: -2 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="flex justify-center lg:justify-end"
        >
          <MockMatterBoard />
        </motion.div>
      </div>
    </section>
  );
}
