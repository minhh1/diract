// app/api/virtual-computers/list/route.ts
// Admins see every virtual computer in the company; regular members see
// only the one(s) assigned to them.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  // Admin-only, and opt-in -- destroyed rows are otherwise excluded so the
  // main list stays a "what's active" view. AdminVirtualComputersTab.tsx
  // uses this to suggest a previously-activated Windows product key (see
  // supabase/virtual_computers_product_key.sql) when creating a new VM for
  // someone who already had one destroyed.
  const includeDestroyed = isAdmin && req.nextUrl.searchParams.get("includeDestroyed") === "1";

  let query = admin
    .from("virtual_computers")
    .select(
      "id, name, provider, protocol, os, with_office, size_slug, region, status, error_message, assigned_user_id, billing_mode, hourly_usd_at_creation, created_at, windows_product_key"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (!includeDestroyed) query = query.neq("status", "destroyed");
  if (!isAdmin) query = query.eq("assigned_user_id", user.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ virtualComputers: data || [] });
}
