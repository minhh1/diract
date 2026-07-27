// app/api/client-update-pages/[id]/date-format/route.ts
// Per-page date display preference -- edited from the page itself, not
// Settings. See components/clientUpdatePages/dateFormat.ts for the fixed
// set of accepted tokens.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { DATE_FORMATS } from "@/components/clientUpdatePages/dateFormat";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const format = body.dateFormat;
  if (!DATE_FORMATS.some(f => f.value === format)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const { error } = await admin.from("client_update_pages").update({ date_format: format }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
