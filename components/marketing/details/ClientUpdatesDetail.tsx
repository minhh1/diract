"use client";

// The rich deep-dive page for "Client updates" -- reuses the real
// client-facing Cards mockup (components/clientUpdatePages/MatterBoard.tsx,
// see mockups.tsx's own comment for the exact classes matched).
import { LayoutPanelLeft } from "lucide-react";
import { useMockupTheme } from "@/components/marketing/MockupThemeProvider";
import { MOCKUPS } from "@/components/marketing/mockups";
import { DetailHero, Section } from "./Section";

const ClientUpdatesMockup = MOCKUPS.clientUpdates;

export default function ClientUpdatesDetail() {
  const isDark = useMockupTheme();
  return (
    <section className="px-6 pb-28">
      <div className="max-w-4xl mx-auto">
        <DetailHero
          badgeIcon={LayoutPanelLeft}
          badgeText="Client updates"
          badgeClass="bg-sky-50 border-sky-100 text-sky-700"
          headlineLines={["A branded page,", "not a status-check phone call."]}
          accentClass="text-sky-600"
          subheadline="A live, always-current view of a matter's progress that you control what a client sees — colour-coded by status, with an AI-written summary line so they don't have to read a full file note."
        />

        <Section eyebrow="Client view" eyebrowClass="text-sky-500" title="Colour by status, summarised in one line">
          <p className="text-[15px] text-slate-500 leading-relaxed mb-6">
            Each matter shows as its own card, tinted by whatever status colour you've set up — expand any one of them for the
            fields you've chosen the client should see.
          </p>
          <div className={isDark ? "dark" : ""}><ClientUpdatesMockup /></div>
        </Section>
      </div>
    </section>
  );
}
