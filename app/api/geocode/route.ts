// app/api/geocode/route.ts
// Proxies OpenStreetMap's free Nominatim geocoding API -- server-side only,
// both because Nominatim's usage policy requires a descriptive User-Agent
// header (not something a browser fetch can reliably set) and to keep this
// gated behind a logged-in company member rather than exposed as an open
// proxy. Used once per property missing lat/lng by
// components/dashboard/quickGlance/PropertyDeveloperQuickGlance.tsx, which
// persists the result onto properties.lat/lng so this is a one-time lookup
// per property, not a per-view one -- callers should NOT re-geocode a
// property that already has coordinates.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;

  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });

  // countrycodes=au -- every caller today geocodes an Australian property
  // address (street/suburb/state/postcode, no country in the string), which
  // Nominatim's free-text search can otherwise mis-match against a
  // same-named street/suburb in another country, or fail to match at all
  // when the address alone is too ambiguous. Restricting the search space
  // measurably improved match rate, not just correctness.
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "niksen-flow/1.0 (property developer Quick Glance map)" },
  });
  if (!res.ok) return NextResponse.json({ lat: null, lng: null });

  const results = await res.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first) return NextResponse.json({ lat: null, lng: null });

  return NextResponse.json({ lat: Number(first.lat), lng: Number(first.lon) });
}
