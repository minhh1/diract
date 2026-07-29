// app/api/client-update-pages/[id]/route.ts
// Full detail load for the admin page editor: page + groups + items (with
// matter name, resolved field values, note log) + field defs. Value editing
// lives at .../values (PATCH), not here -- this is read-only.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { loadPageDetail } from "@/lib/clientUpdatePageDetail";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const detail = await loadPageDetail(admin, id, { baseTable: gate.page.base_table, pageKind: gate.page.page_kind });
  return NextResponse.json({ page: gate.page, ...detail });
}
