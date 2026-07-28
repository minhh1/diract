// app/api/client-update-pages/entities/search/route.ts
// Backs the "add an entity" picker on an entities-based Client Update Page
// -- searches this company's entities by name. Sibling to
// .../matters/search/route.ts (kept separate rather than merged, so neither
// route's query shape has to account for the other).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ entities: [] });

  const { data: byName } = await admin
    .from("entities").select("id, name, entity_type").eq("company_id", companyId).is("deleted_at", null)
    .ilike("name", `%${q}%`).order("name").limit(20);

  return NextResponse.json({ entities: (byName || []).map(e => ({ id: e.id, name: e.name, description: e.entity_type })) });
}
