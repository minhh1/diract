// app/api/client-update-pages/matters/search/route.ts
// Backs the "add a matter" picker -- searches this company's projects by
// name or by Matter Number custom field value.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ matters: [] });

  const { data: byName } = await admin
    .from("projects").select("id, name, description").eq("company_id", companyId).is("deleted_at", null)
    .ilike("name", `%${q}%`).limit(15);

  const { data: matterNumberField } = await admin
    .from("company_custom_fields").select("id").eq("company_id", companyId).eq("table_name", "projects").eq("field_key", "matter_number").maybeSingle();

  let byMatterNumber: any[] = [];
  if (matterNumberField) {
    const { data: vals } = await admin
      .from("company_custom_field_values").select("record_id, value_text")
      .eq("field_id", matterNumberField.id).eq("company_id", companyId).ilike("value_text", `%${q}%`).limit(15);
    if (vals?.length) {
      const { data: projects } = await admin.from("projects").select("id, name, description").in("id", vals.map(v => v.record_id));
      byMatterNumber = projects || [];
    }
  }

  const byId = new Map([...(byName || []), ...byMatterNumber].map(p => [p.id, p]));
  return NextResponse.json({ matters: [...byId.values()].slice(0, 20) });
}
