// app/api/client-update-pages/table-fields/route.ts
// Creation-time field preview for the new table/field picker in
// components/settings/ClientUpdatePagesTab.tsx -- there's no page id yet at
// this point, so this is a standalone GET rather than reusing
// .../[id]/fields/route.ts (which loads its base_table from an existing
// page row). Deliberately just base+custom fields, no relation drill-in or
// projects-only property/related-table options (those are a deferred
// generalization -- see lib/clientUpdatePageTableResolver.ts's header, and
// .../[id]/fields/route.ts still offers them for existing projects pages).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { resolveTableFields } from "@/lib/clientUpdatePageTableResolver";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const table = req.nextUrl.searchParams.get("table")?.trim() || "";
  if (!table) return NextResponse.json({ error: "table is required" }, { status: 400 });

  const { base, custom } = await resolveTableFields(admin, companyId, table);
  return NextResponse.json({ base, custom });
}
