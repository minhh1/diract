// app/api/ai/archive-records/route.ts
// Backs ProposedRecordsList.tsx's "Archive selected" button -- a direct
// UI-to-API call, not another AI model round-trip (the tool-calling loop in
// app/api/ai/chat/route.ts is already finished by the time the user acts on
// a rendered checklist). Archiving a matter is just projects.status =
// 'Closed', the same write lib/ai/actions.ts's updateProject already makes
// and already unrestricted to any company member (see
// supabase/migrations/20260726110000_projects_active_index.sql -- status <>
// 'Closed' is this app's own definition of "active", nothing new is being
// opened up here). Scoped to 'projects' only -- propose_records can in
// principle name a custom table's record, but "archive" only has a defined
// meaning for Matters today; a custom table has no guaranteed status field
// to flip.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const recordIds: string[] = Array.isArray(body?.record_ids) ? body.record_ids.map(String) : [];
  if (!recordIds.length) return NextResponse.json({ error: "record_ids is required" }, { status: 400 });

  const { data, error } = await admin
    .from("projects")
    .update({ status: "Closed" })
    .eq("company_id", companyId)
    .in("id", recordIds)
    .is("deleted_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ archivedIds: (data ?? []).map((r: any) => r.id) });
}
