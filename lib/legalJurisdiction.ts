// lib/legalJurisdiction.ts
// Which jurisdiction-specific section of the Terms/Privacy pages to show a
// visitor by default. Read server-side from Vercel's geo header (same
// header app/api/track/visit/route.ts already reads) so there's no client
// round trip or consent-requiring geolocation prompt involved.
//
// This never HIDES a jurisdiction's rights from anyone -- all three stay one
// click away regardless of where a visitor is detected to be. IP-based geo
// isn't reliable enough to be the sole determinant of which legal
// protections apply (a person could be travelling, on a VPN, or a data
// subject located elsewhere than their current connection), so it only ever
// picks which tab opens first.
export type Jurisdiction = "AU" | "EU_UK" | "US";

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/** GB (post-Brexit UK) is grouped with the EU section -- UK GDPR mirrors the EU regime closely enough that one section serves both, and splitting it into a fourth tab for a handful of clauses that differ isn't worth the added complexity here. */
export function jurisdictionForCountry(countryCode: string | null): Jurisdiction {
  if (!countryCode) return "AU";
  const code = countryCode.toUpperCase();
  if (code === "AU") return "AU";
  if (code === "US") return "US";
  if (code === "GB" || EU_COUNTRY_CODES.has(code)) return "EU_UK";
  // Primary market default for anywhere else (including local dev, where
  // the geo header is never present) rather than an arbitrary guess.
  return "AU";
}
