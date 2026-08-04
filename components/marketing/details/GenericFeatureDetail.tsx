"use client";

// Fallback detail page for any feature that doesn't have bespoke deep-dive
// content yet (see AiTimeEntriesDetail/TrustComplianceDetail for the two
// that do) -- reuses the same title/body/mockup already shown in the
// feature-spotlight row it was clicked from, just given more room.
import Link from "next/link";
import type { SpotlightFeature } from "@/components/marketing/FeatureSpotlight";
import { MOCKUPS } from "@/components/marketing/mockups";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";

export default function GenericFeatureDetail({ feature }: { feature: SpotlightFeature }) {
  const Mockup = MOCKUPS[feature.visual];
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-light tracking-tight text-slate-900 mb-6 leading-[1.05]">{feature.title}</h1>
        <p className="text-lg text-slate-500 font-light max-w-xl mb-12 leading-relaxed">{feature.body}</p>
        <div className={`flex justify-center ${isDark ? "dark" : ""}`}>
          <Mockup />
        </div>
        <div className="mt-14 text-center">
          <Link href="/login" className="px-7 py-3.5 bg-indigo-600 text-white text-sm font-medium rounded-full hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 inline-block">
            Get started
          </Link>
        </div>
      </div>
    </section>
  );
}
