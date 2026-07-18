// lib/vmProviders/registry.ts
import type { CloudProviderId, VmProvider } from "./types";
import { digitalOceanProvider } from "./digitalocean";

// Only DigitalOcean is provisionable in Phase 1. AWS/GCP still appear in the
// admin cost-comparison table (see lib/vmProviders/pricing.ts) but aren't
// selectable for creation until their adapters land in Phase 2.
export const PROVISIONABLE_PROVIDERS: CloudProviderId[] = ["digitalocean"];

const PROVIDERS: Partial<Record<CloudProviderId, VmProvider>> = {
  digitalocean: digitalOceanProvider,
};

export function getProvider(id: CloudProviderId): VmProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Provider "${id}" is not yet provisionable.`);
  return provider;
}
