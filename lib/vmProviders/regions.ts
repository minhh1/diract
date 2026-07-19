// lib/vmProviders/regions.ts
// Static, curated list of currently-active regions per provider, for the
// region <select> in the admin create-VM form -- a free-text region field
// previously let through both typos and deprecated/mismatched region
// slugs, producing real DigitalOcean 422s ("no regions available that
// match your request"). Not full per-size availability checking -- DO's
// standard Basic droplet sizes (the only sizes this repo offers, see
// lib/vmProviders/pricing.ts) are available in all regions listed here as
// of writing; refresh this list by hand if that ever changes.
import type { CloudProviderId } from "./types";

// The Guacamole streaming gateway (guacd + guacamole, see
// guacamole/fly.guacd.*.toml) is deployed as a separate app-pair per Fly
// region rather than one multi-region app -- Guacamole's web client only
// supports a single, fixed GUACD_HOSTNAME per deployment, so there's no way
// for one running instance to pick a different guacd at request time.
// `flyRegion` records, for each VM region, which of those gateway pairs is
// geographically closest -- that's the hop that matters most: guacd proxies
// the actual chatty RDP/VNC protocol to the VM, so co-locating it with the
// VM (rather than with the connecting browser) is what avoids round trips
// crossing an ocean. Measured directly (curl connect time): ~67ms to AWS
// ap-southeast-2 vs. ~250ms to us-east-1 from a location near the Sydney
// gateway -- a real, felt cost, not a theoretical one.
export type FlyRegion = "syd" | "iad" | "fra" | "sin";

export const FLY_REGION_LABELS: Record<FlyRegion, string> = {
  syd: "Sydney",
  iad: "US (Virginia)",
  fra: "Europe (Frankfurt)",
  sin: "Asia (Singapore)",
};

export interface RegionOption {
  slug: string;
  label: string;
  flyRegion: FlyRegion;
}

export const REGIONS: Partial<Record<CloudProviderId, RegionOption[]>> = {
  digitalocean: [
    { slug: "nyc1", label: "New York 1", flyRegion: "iad" },
    { slug: "nyc3", label: "New York 3", flyRegion: "iad" },
    { slug: "sfo3", label: "San Francisco 3", flyRegion: "iad" },
    { slug: "tor1", label: "Toronto 1", flyRegion: "iad" },
    { slug: "lon1", label: "London 1", flyRegion: "fra" },
    { slug: "ams3", label: "Amsterdam 3", flyRegion: "fra" },
    { slug: "fra1", label: "Frankfurt 1", flyRegion: "fra" },
    { slug: "sgp1", label: "Singapore 1", flyRegion: "sin" },
    { slug: "blr1", label: "Bangalore 1", flyRegion: "sin" },
    { slug: "syd1", label: "Sydney 1", flyRegion: "syd" },
  ],
  aws: [
    { slug: "us-east-1", label: "N. Virginia", flyRegion: "iad" },
    { slug: "us-west-2", label: "Oregon", flyRegion: "iad" },
    { slug: "eu-west-1", label: "Ireland", flyRegion: "fra" },
    { slug: "eu-central-1", label: "Frankfurt", flyRegion: "fra" },
    { slug: "ap-southeast-1", label: "Singapore", flyRegion: "sin" },
    { slug: "ap-southeast-2", label: "Sydney", flyRegion: "syd" },
  ],
};

// Falls back to "syd" (the original single-region gateway) for any
// provider/region combination not listed above, rather than throwing --
// new regions added to the lists above should also get a real flyRegion,
// but a stale/unlisted region shouldn't break session creation.
export function resolveFlyRegion(provider: CloudProviderId, regionSlug: string): FlyRegion {
  const match = (REGIONS[provider] || []).find((r) => r.slug === regionSlug);
  return match?.flyRegion || "syd";
}
