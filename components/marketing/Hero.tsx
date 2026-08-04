"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MOCKUPS, type MockupName } from "./mockups";
import { useMockupTheme } from "./MockupThemeProvider";

interface HeroProps {
  badge: string;
  headlineLines: [string, string];
  subheadline: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  visual?: MockupName;
}

export default function Hero({ badge, headlineLines, subheadline, primaryCta, secondaryCta, visual = "customTable" }: HeroProps) {
  const Mockup = MOCKUPS[visual];
  const isDark = useMockupTheme();
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
                {secondaryCta.label}
              </Link>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: -2 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className={`flex justify-center lg:justify-end ${isDark ? "dark" : ""}`}
        >
          <Mockup />
        </motion.div>
      </div>
    </section>
  );
}
