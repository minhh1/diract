// Flattens every feature across the home page and every audience page into
// one slug-keyed lookup, for app/(marketing)/features/[slug]/page.tsx --
// each feature keeps a `back` link pointing at whichever page it came from,
// so the detail page can offer a sensible "back to" link regardless of
// which landing page a visitor arrived from.
import type { SpotlightFeature } from "@/components/marketing/FeatureSpotlight";
import { HOME_FEATURES } from "./homeFeatures";
import { AUDIENCES } from "./audiences";

export interface FeatureEntry {
  feature: SpotlightFeature;
  back: { href: string; label: string };
}

function buildRegistry(): Record<string, FeatureEntry> {
  const registry: Record<string, FeatureEntry> = {};
  for (const feature of HOME_FEATURES) {
    registry[feature.slug] = { feature, back: { href: "/", label: "Diract" } };
  }
  for (const audience of Object.values(AUDIENCES)) {
    for (const feature of audience.features) {
      registry[feature.slug] = { feature, back: { href: `/for/${audience.slug}`, label: audience.navLabel } };
    }
  }
  return registry;
}

export const ALL_FEATURES = buildRegistry();

export function getFeatureEntry(slug: string): FeatureEntry | null {
  return ALL_FEATURES[slug] ?? null;
}
