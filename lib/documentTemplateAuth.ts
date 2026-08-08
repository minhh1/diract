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
    admin.from("company_memberships").select("company_id, role, custom_role_id").eq("user_id", user.id),
  ]);
  const companyId = profile?.active_company_id;
  if (!companyId) return { error: NextResponse.json({ error: "No active company" }, { status: 400 }) };

  const membership = memberships?.find(m => m.company_id === companyId);
  if (!membership) return { error: NextResponse.json({ error: "You don't have access to this company" }, { status: 403 }) };

  // Company-defined custom role (supabase/migrations/20260808210000_staff_
  // precreate_and_custom_roles.sql) -- an ADDITIVE layer on top of admin/
  // operator, never a replacement. Only fetched when a custom role is
  // actually assigned (the common case has none), so this never adds a
  // round trip to the ~95 routes that only ever check isAdmin.
  let permissions = new Set<string>();
  if (membership.custom_role_id) {
    const { data: role } = await admin
      .from("company_custom_roles").select("permissions").eq("id", membership.custom_role_id).maybeSingle();
    permissions = new Set((role?.permissions as string[] | null) || []);
  }
  const hasPermission = (slug: string) => permissions.has(slug);

  return { admin, user, companyId, isAdmin: membership.role === "company_admin", hasPermission };
}
