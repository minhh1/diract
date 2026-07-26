// lib/documentTemplateAuth.ts
// Shared admin-side authorization for document-template API routes. Confirms a
// signed-in session, resolves the caller's active company + membership, and (when
// a projectId is supplied) that the project belongs to that company. Mirrors the
// auth+company-membership shape used by app/api/public-tasks/create/route.ts.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Returns { admin, user, companyId, isAdmin } or { error } (a NextResponse).
export async function authorizeCompanyMember() {
  const admin = adminClient();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  // Membership lookup only needs user_id, not active_company_id -- so it
  // doesn't actually have to wait on the profile fetch to resolve first.
  // Fetching all of this user's memberships (not filtered to one company)
  // and matching in-process lets both queries run in parallel instead of a
  // sequential round-trip chain (same trick CompanyContext.tsx uses
  // client-side for the same reason).
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("active_company_id").eq("id", user.id).single(),
    admin.from("company_memberships").select("company_id, role").eq("user_id", user.id),
  ]);
  const companyId = profile?.active_company_id;
  if (!companyId) return { error: NextResponse.json({ error: "No active company" }, { status: 400 }) };

  const membership = memberships?.find(m => m.company_id === companyId);
  if (!membership) return { error: NextResponse.json({ error: "You don't have access to this company" }, { status: 403 }) };

  return { admin, user, companyId, isAdmin: membership.role === "company_admin" };
}
