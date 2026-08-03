// app/api/client-update-pages/[id]/logs/route.ts
// Activity log for a Client Update Page -- most recent first. With
// ?itemId=&fieldId= it instead scopes down to one cell's own history (only
// value_changed rows, oldest-context columns included) -- same table, see
// the public/[slug]/cell-logs route for the client-side equivalent of this
// filtered mode.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const itemId = req.nextUrl.searchParams.get("itemId");
  const fieldId = req.nextUrl.searchParams.get("fieldId");

  let query = admin
    .from("client_update_page_logs")
    .select("id, actor_name, source, action, detail, old_value, new_value, reason, created_at")
    .eq("page_id", id)
    .order("created_at", { ascending: false });

  // 'settlement_status' alongside 'value_changed' -- the bulk AI status
  // check (.../settlement-status-all/route.ts) logs a status note against
  // the Settlement Date field even when nothing actually changed (extension
  // requested, followed up, not yet agreed, no discussion), so it needs to
  // show up here too, not just the page-wide activity log.
  if (itemId && fieldId) query = query.eq("item_id", itemId).eq("field_id", fieldId).in("action", ["value_changed", "settlement_status"]);
  else query = query.limit(200);

  const { data: logs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: logs || [] });
}
