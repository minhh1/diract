// lib/clientUpdatePagesAdmin.ts
// Shared helper for the authenticated (internal, staff) Client Update Pages
// API routes -- confirms a given pageId belongs to the caller's company
// before any child-resource route (groups/items/fields/values/notes) acts
// on it. Pairs with authorizeCompanyMember() from lib/documentTemplateAuth.ts.
import { NextResponse } from "next/server";

export async function loadPageForCompany(admin: any, pageId: string, companyId: string) {
  const { data: page } = await admin
    .from("client_update_pages").select("id, company_id, title, slug, date_format").eq("id", pageId).maybeSingle();
  if (!page || page.company_id !== companyId) {
    return { error: NextResponse.json({ error: "Page not found" }, { status: 404 }), page: null };
  }
  return { error: null as null, page };
}
