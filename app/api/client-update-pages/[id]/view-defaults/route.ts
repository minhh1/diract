// app/api/client-update-pages/[id]/view-defaults/route.ts
// Admin-side (auth required). Saves the company-shared default sort/filter
// for one group of a board -- see
// supabase/migrations/20260802120000_client_update_page_view_defaults.sql
// for why these need a server-side home at all (they were localStorage-only,
// so colleagues and public viewers could never inherit the admin's view).
//
// Deliberately company-wide rather than per-user: the ask was that everyone
// sees what the admin sees, at least to begin with. A viewer's own
// localStorage choice still takes precedence in MatterBoard, so this sets
// the starting point, it doesn't override anyone mid-session.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pageId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const { data: page } = await admin
    .from("client_update_pages").select("id, company_id").eq("id", pageId).maybeSingle();
  if (!page || page.company_id !== companyId) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const groupId: string | undefined = body?.groupId;
  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  // Normalised to exactly the shapes MatterBoard stores, dropping anything
  // malformed rather than persisting a shape the board can't read back.
  const filters = Array.isArray(body?.filters)
    ? body.filters
        .filter((f: any) => f && typeof f.fieldId === "string")
        .map((f: any) => ({ fieldId: f.fieldId, values: Array.isArray(f.values) ? f.values.map(String) : [] }))
    : [];
  const sort = Array.isArray(body?.sort)
    ? body.sort
        .filter((s: any) => s && typeof s.fieldId === "string" && (s.dir === "asc" || s.dir === "desc"))
        .map((s: any) => ({ fieldId: s.fieldId, dir: s.dir }))
    : [];

  const { error } = await admin
    .from("client_update_page_view_defaults")
    .upsert(
      { page_id: pageId, company_id: companyId, group_id: groupId, filters, sort, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: "page_id,group_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
