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

// `latencyTier: "near"` means close enough to the Guacamole streaming
// gateway (guacd/guacamole, both single-machine in Fly's Sydney region --
// see guacamole/fly.guacd.toml) that RDP/VNC's round-trip-heavy traffic
// doesn't cross an ocean. Measured directly (curl connect time): ~67ms to
// AWS ap-southeast-2 vs. ~250ms to us-east-1 from a location near the Fly
// deployment -- "far" regions carry a real, felt latency cost, not a
// theoretical one. Used to steer (not block) region selection in
// components/admin/AdminVirtualComputersTab.tsx.
export interface RegionOption {
  slug: string;
  label: string;
  latencyTier: "near" | "far";
}

export const REGIONS: Partial<Record<CloudProviderId, RegionOption[]>> = {
  digitalocean: [
    { slug: "nyc1", label: "New York 1", latencyTier: "far" },
    { slug: "nyc3", label: "New York 3", latencyTier: "far" },
    { slug: "sfo3", label: "San Francisco 3", latencyTier: "far" },
    { slug: "tor1", label: "Toronto 1", latencyTier: "far" },
    { slug: "lon1", label: "London 1", latencyTier: "far" },
    { slug: "ams3", label: "Amsterdam 3", latencyTier: "far" },
    { slug: "fra1", label: "Frankfurt 1", latencyTier: "far" },
    { slug: "sgp1", label: "Singapore 1", latencyTier: "far" },
    { slug: "blr1", label: "Bangalore 1", latencyTier: "far" },
    { slug: "syd1", label: "Sydney 1", latencyTier: "near" },
  ],
  aws: [
    { slug: "us-east-1", label: "N. Virginia", latencyTier: "far" },
    { slug: "us-west-2", label: "Oregon", latencyTier: "far" },
    { slug: "eu-west-1", label: "Ireland", latencyTier: "far" },
    { slug: "eu-central-1", label: "Frankfurt", latencyTier: "far" },
    { slug: "ap-southeast-1", label: "Singapore", latencyTier: "far" },
    { slug: "ap-southeast-2", label: "Sydney", latencyTier: "near" },
  ],
};
