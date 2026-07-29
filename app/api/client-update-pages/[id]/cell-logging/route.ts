// app/api/client-update-pages/[id]/cell-logging/route.ts
// Toggles log_cell_changes -- staff-only display/behavior preference (like
// freeze-column/route.ts), gating the "why is this changing?" prompt and
// per-cell change history writes in values/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { error } = await admin.from("client_update_pages").update({ log_cell_changes: !!body.logCellChanges }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
