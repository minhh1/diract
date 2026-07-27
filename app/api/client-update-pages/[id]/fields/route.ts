// app/api/client-update-pages/[id]/fields/route.ts
// GET returns the pickable field catalog (base projects columns + the two
// synthetic property-linked keys + this company's projects custom fields) so
// the admin editor can offer a checkbox list; POST adds one (or an 'adhoc'
// page-only field, which just needs a label) to the page.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

const SYNTHETIC_BASE_FIELDS = [
  { field_key: "property_address", label: "Property Address" },
  { field_key: "purchase_price", label: "Purchase Price" },
];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const [{ data: schemaCols }, { data: customFields }] = await Promise.all([
    admin.rpc("get_schema_metadata", { target_table: "projects", p_company_id: companyId }),
    admin.from("company_custom_fields").select("id, field_key, label").eq("company_id", companyId).eq("table_name", "projects").is("deleted_at", null),
  ]);

  const baseOptions = [
    ...SYNTHETIC_BASE_FIELDS,
    ...(schemaCols || [])
      .filter((c: any) => c.category === "data" && !c.is_hidden)
      .map((c: any) => ({ field_key: c.column_name, label: c.label || c.column_name.replace(/_/g, " ") })),
  ];
  const customOptions = (customFields || []).map((f: any) => ({ field_key: f.id, label: f.label }));

  return NextResponse.json({ base: baseOptions, custom: customOptions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { fieldSource, fieldKey, label } = body;
  if (!["base", "custom", "adhoc"].includes(fieldSource)) {
    return NextResponse.json({ error: "Invalid field source" }, { status: 400 });
  }
  if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (fieldSource !== "adhoc" && !fieldKey) return NextResponse.json({ error: "fieldKey is required" }, { status: 400 });

  const { count } = await admin.from("client_update_page_fields").select("id", { count: "exact", head: true }).eq("page_id", id);
  const { data: field, error } = await admin.from("client_update_page_fields").insert({
    page_id: id, field_source: fieldSource, field_key: fieldSource === "adhoc" ? `adhoc_${Date.now()}` : fieldKey,
    label: label.trim(), display_order: count || 0,
  }).select("id, field_source, field_key, label, display_order, client_visible").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ field });
}
