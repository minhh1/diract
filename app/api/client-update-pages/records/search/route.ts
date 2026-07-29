// app/api/client-update-pages/records/search/route.ts
// Backs the "add a record" picker (components/clientUpdatePages/
// AddMatterModal.tsx) for ANY Detailed Table Page base table -- replaces
// the old .../matters/search and .../entities/search routes, which each
// only knew how to search one hardcoded table.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { searchRecords } from "@/lib/clientUpdatePageTableResolver";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const table = req.nextUrl.searchParams.get("table")?.trim() || "";
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (!table || q.length < 2) return NextResponse.json({ records: [] });

  const records = await searchRecords(admin, companyId, table, q);
  return NextResponse.json({ records });
}
