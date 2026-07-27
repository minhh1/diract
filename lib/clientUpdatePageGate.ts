// lib/clientUpdatePageGate.ts
// Gating for the GENUINELY UNAUTHENTICATED client-facing Client Update Page
// routes. There is NO user session on this side -- access is granted purely
// by the slug resolving to an active, unexpired page, using the service-role
// admin client throughout. Deliberately returns a single generic "not found"
// (404) for missing / revoked / expired pages so a revoked page can't be
// distinguished from one that never existed. Modelled directly on
// lib/documentFillPageGate.ts, keyed by `slug` (the human-chosen custom URL)
// instead of the raw page id.
import { NextResponse } from "next/server";

export async function loadActivePageBySlug(admin: any, slug: string) {
  const { data: page } = await admin
    .from("client_update_pages")
    .select("id, company_id, title, client_label, slug, expires_at, is_active, access_code, date_format")
    .eq("slug", slug).maybeSingle();

  const notFound = { error: NextResponse.json({ error: "This page is not available" }, { status: 404 }), page: null };

  if (!page) return notFound;
  if (!page.is_active) return notFound;
  if (page.expires_at) {
    // expires_at is a DATE -- the page is valid through the end of that day.
    const expiry = new Date(`${String(page.expires_at).slice(0, 10)}T23:59:59`);
    if (expiry < new Date()) return notFound;
  }

  return { error: null as null, page };
}

// Access-code (PIN) check -- a second, independent gate on top of
// expiry/active, shared over a different channel than the link itself.
// Comparison is trimmed but not case-normalized (PINs here are numeric).
export function codeMatches(page: { access_code: string | null }, provided: string | null | undefined): boolean {
  if (!page.access_code) return true;
  return String(provided || "").trim() === page.access_code;
}
