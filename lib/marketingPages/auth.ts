// lib/marketingPages/auth.ts
// Access control for the dashboard-editable marketing-page-copy feature
// (app/api/marketing-pages/*, components/admin/AdminLandingPagesTab.tsx).
//
// Deliberately NOT authorizeCompanyMember() (lib/documentTemplateAuth.ts) --
// that resolves companyId from the caller's *currently active* company
// (profile.active_company_id), which has nothing to do with this feature:
// marketing_page_content always belongs to one fixed company (created once
// by scripts/createMinhHuynhCompany.ts), regardless of which company the
// signed-in user happens to have switched to in the app right now. And the
// requirement here is narrower than "any admin of that company" -- it's
// "this exact person" -- so both ids are hardcoded and checked directly.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { adminClient } from "@/lib/documentTemplateAuth";
import { MINH_HUYNH_USER_ID } from "@/lib/marketingPages/ids";

export { MINH_HUYNH_USER_ID, MINH_HUYNH_COMPANY_ID } from "@/lib/marketingPages/ids";

// Returns { admin, userId } or { error } (a NextResponse) -- every
// app/api/marketing-pages/* route calls this first, before touching
// marketing_page_content at all.
export async function requireMinhHuynh() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (user.id !== MINH_HUYNH_USER_ID) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { admin: adminClient(), userId: user.id };
}
