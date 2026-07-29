// app/api/client-update-pages/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { isSystemTable, validateRecordBelongsToCompany, resolveDisplayNamesBatch } from "@/lib/clientUpdatePageTableResolver";

const SYSTEM_TABLE_LABEL: Record<string, string> = { projects: "Matter", entities: "Entity", properties: "Property" };

async function recordTableLabel(admin: any, recordTable: string): Promise<string> {
  if (isSystemTable(recordTable)) return SYSTEM_TABLE_LABEL[recordTable] || "Record";
  const { data } = await admin.from("company_tables").select("name").eq("id", recordTable).maybeSingle();
  return data?.name || "Record";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  // An auto_fed page's items are system-generated (e.g. Irregularities
  // rows, created by the rule engine) -- never manually added.
  if (gate.page.page_kind === "auto_fed") {
    return NextResponse.json({ error: "Items on this page can't be added manually" }, { status: 400 });
  }
  const baseTable: string = gate.page.base_table;
  const label = await recordTableLabel(admin, baseTable);

  const body = await req.json().catch(() => ({}));
  const recordId: string | undefined = body.recordId;
  if (!recordId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

  const belongsToCompany = await validateRecordBelongsToCompany(admin, companyId, baseTable, recordId);
  if (!belongsToCompany) return NextResponse.json({ error: `${label} not found` }, { status: 404 });

  const { count } = await admin.from("client_update_page_items").select("id", { count: "exact", head: true }).eq("page_id", id);
  const { data: item, error } = await admin.from("client_update_page_items")
    .insert({ page_id: id, group_id: body.groupId || null, display_order: count || 0, record_table: baseTable, record_id: recordId })
    .select("id, record_table, record_id, group_id, display_order").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: `That ${label.toLowerCase()} is already on this page` }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const displayNameById = await resolveDisplayNamesBatch(admin, baseTable, [recordId]);
  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "record_added", `Added ${label.toLowerCase()} "${displayNameById.get(recordId) || ""}" to the page`);

  return NextResponse.json({ item });
}
