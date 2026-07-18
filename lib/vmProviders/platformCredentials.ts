// lib/vmProviders/platformCredentials.ts
// Platform-owned cloud credentials for platform-billed virtual computers
// (see supabase/virtual_computers_billing_mode.sql). Unlike
// company_cloud_credentials -- which exists because BYO creds vary per
// company -- there is exactly one owner of these accounts (the platform
// operator), so env vars set once at deploy time are the right fit.
import type { CloudProviderId, ProviderCredentials } from "./types";

export function getPlatformCredentials(provider: CloudProviderId): ProviderCredentials {
  switch (provider) {
    case "digitalocean": {
      const token = process.env.DIGITALOCEAN_PLATFORM_API_TOKEN;
      if (!token) throw new Error("DIGITALOCEAN_PLATFORM_API_TOKEN is not configured.");
      return { api_token: token };
    }
    default:
      throw new Error(`Platform-billed VMs are not configured for provider "${provider}" yet.`);
  }
}
