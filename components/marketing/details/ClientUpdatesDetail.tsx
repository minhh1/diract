"use client";

// The rich deep-dive page for "Client updates" -- reuses the real
// client-facing Cards mockup (components/clientUpdatePages/MatterBoard.tsx,
// see mockups.tsx's own comment for the exact classes matched).
import { LayoutPanelLeft } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";
import type { FeatureDetailCopy } from "@/lib/marketingPages/publishedContent";

const ClientUpdatesMockup = MOCKUPS.clientUpdates;

export const DEFAULT_CONTENT: FeatureDetailCopy = {
  badgeText: "Client updates",
  headlineLine1: "A branded page,",
  headlineLine2: "not a status-check phone call.",
  subheadline: "A live, always-current view of a matter's progress that you control what a client sees. It's colour-coded by status, with an AI-written summary line so they don't have to read a full file note.",
  sections: [
    {
      key: "client-view",
      eyebrow: "Client view",
      title: "Colour by status, summarised in one line",
      body: ["Each matter shows as its own card, tinted by whatever status colour you've set up. Expand any one of them for the fields you've chosen the client should see."],
    },
  ],
};

export default function ClientUpdatesDetail({ content }: { content?: FeatureDetailCopy } = {}) {
  const isDark = useMockupTheme();
  const copy = content ?? DEFAULT_CONTENT;
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={LayoutPanelLeft}
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
          <div className={isDark ? "dark" : ""}><ClientUpdatesMockup /></div>
        </Section>
      </div>
    </section>
  );
}
