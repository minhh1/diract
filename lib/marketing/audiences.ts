// Content registry for the /for/[audience] landing pages -- adding the
// next company/industry variant is "add an entry here," not "build a new
// page." app/(marketing)/for/[audience]/page.tsx renders whichever entry
// matches the slug through the same Hero/FeatureSpotlight components the
// main landing page uses.
import type { SpotlightAccent, SpotlightIconName } from "@/components/marketing/FeatureSpotlight";

export interface AudienceFeature {
  icon: SpotlightIconName;
  title: string;
  body: string;
  accent: SpotlightAccent;
}

export interface AudienceContent {
  slug: string;
  badge: string;
  headlineLines: [string, string];
  subheadline: string;
  eyebrow: string;
  heading: string;
  primaryCtaLabel: string;
  features: AudienceFeature[];
}

export const AUDIENCES: Record<string, AudienceContent> = {
  "law-firm-au": {
    slug: "law-firm-au",
    badge: "Built for Australian law firms",
    headlineLines: ["Matter management,", "built for legal practice."],
    subheadline: "Diract brings your matters, entities, trust compliance, and client communication into one system — purpose-built for Australian firms, with ABN/ACN-aware onboarding from day one.",
    eyebrow: "For law firms",
    heading: "Everything your practice needs, nothing it doesn't",
    primaryCtaLabel: "Start your firm's workspace",
    features: [
      {
        icon: "FolderKanban",
        title: "Matter & entity management",
        body: "Track every matter alongside the entities involved, with custom fields and statuses that match how your firm actually runs files.",
        accent: "indigo",
      },
      {
        icon: "LayoutPanelLeft",
        title: "Client Update Portal",
        body: "Give clients a branded, always-current view of their matter's progress — no more \"just checking in\" phone calls.",
        accent: "sky",
      },
      {
        icon: "ShieldAlert",
        title: "Trust & compliance checks",
        body: "Automatic irregularity detection flags issues before they become compliance problems, so nothing slips through at settlement.",
        accent: "amber",
      },
      {
        icon: "Users",
        title: "Officeholder register",
        body: "Keep a live register of directors, secretaries, and officeholders tied directly to each entity — always current, always auditable.",
        accent: "violet",
      },
      {
        icon: "Mail",
        title: "Gmail-native correspondence",
        body: "Assign and label correspondence to the right matter straight from Gmail, synced across your whole team in minutes.",
        accent: "emerald",
      },
      {
        icon: "BadgeCheck",
        title: "ABN/ACN-aware onboarding",
        body: "Set up your firm with built-in ABN and ACN validation — no generic sign-up form pretending Australian company law doesn't exist.",
        accent: "indigo",
      },
    ],
  },
};

export function getAudience(slug: string): AudienceContent | null {
  return AUDIENCES[slug] ?? null;
}
