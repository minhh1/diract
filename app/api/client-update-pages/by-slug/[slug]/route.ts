// app/api/client-update-pages/by-slug/[slug]/route.ts
// Authenticated counterpart to the public PIN-gated route, keyed by the
// same slug -- lets the public page (app/public/updates/[slug]/page.tsx)
// silently check "is the current browser session a logged-in member of
// this page's company?" and if so skip the PIN entirely and hand back the
// full editable board (same shape as [id]/route.ts, unfiltered by
// client_visible since that flag only matters for the external client).
// A 401/404 here is the page's cue to fall back to the normal PIN flow --
// not an error state, just "not a staff member," so it deliberately mirrors
// the public route's generic-404 discipline (never reveals whether the slug
// exists to a caller who isn't a member of the right company).
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageDetail } from "@/lib/clientUpdatePageDetail";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return NextResponse.json({ error: "Not staff" }, { status: 401 });
  const { admin, companyId } = auth;

  const { data: page } = await admin
    .from("client_update_pages").select("id, company_id, title, client_label, slug, is_active, date_format, freeze_first_column").eq("slug", slug).maybeSingle();
  if (!page || page.company_id !== companyId || !page.is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const detail = await loadPageDetail(admin, page.id);
  return NextResponse.json({ page, ...detail });
}
