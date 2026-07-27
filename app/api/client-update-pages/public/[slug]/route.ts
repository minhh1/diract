// app/api/client-update-pages/public/[slug]/route.ts
// GENUINELY UNAUTHENTICATED client-facing route (see lib/clientUpdatePageGate.ts)
// -- no supabase.auth calls, service-role admin client throughout. Returns
// the page's matters grouped, with each field's live value resolved from
// wherever it actually lives:
//  - field_source 'custom'  -> company_custom_field_values (field_key is the
//    company_custom_fields.id)
//  - field_source 'base', field_key 'property_address'/'purchase_price'    -> via
//    the matter's linked properties row
//  - field_source 'base', any other field_key                             -> a
//    column directly on projects (e.g. estimated_completion_date)
//  - field_source 'adhoc'   -> client_update_page_values (page-only, no
//    underlying record)
// Editing a 'custom'/'base' field here writes through to the SAME
// projects/properties/company_custom_field_values rows the normal internal
// matter dashboard reads -- see the admin (authenticated) routes for writes;
// this GET route only ever reads.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActivePageBySlug, codeMatches } from "@/lib/clientUpdatePageGate";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActivePageBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { page } = gate;

  if (page.access_code) {
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.json({ title: page.title, clientLabel: page.client_label, requiresCode: true, fieldDefs: [], groups: [] });
    if (!codeMatches(page, code)) {
      return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
    }
  }

  const [{ data: fieldDefs }, { data: groupRows }, { data: items }] = await Promise.all([
    admin.from("client_update_page_fields").select("id, field_source, field_key, label, display_order, client_visible")
      .eq("page_id", page.id).order("display_order"),
    admin.from("client_update_groups").select("id, name, display_order").eq("page_id", page.id).order("display_order"),
    admin.from("client_update_page_items").select("id, project_id, group_id, display_order").eq("page_id", page.id).order("display_order"),
  ]);

  const visibleFieldDefs = (fieldDefs || []).filter((f: any) => f.client_visible);
  const projectIds = (items || []).map((i: any) => i.project_id);
  const itemIds = (items || []).map((i: any) => i.id);

  const [{ data: projects }, { data: notes }] = await Promise.all([
    projectIds.length
      ? admin.from("projects").select("id, name, property_id, estimated_completion_date").in("id", projectIds)
      : Promise.resolve({ data: [] as any[] }),
    itemIds.length
      ? admin.from("client_update_page_notes").select("id, item_id, note_date, body, author_name, source, created_at")
          .in("item_id", itemIds).order("note_date", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const projectById = new Map((projects || []).map((p: any) => [p.id, p]));

  const propertyIds = [...new Set((projects || []).map((p: any) => p.property_id).filter(Boolean))];
  const { data: properties } = propertyIds.length
    ? await admin.from("properties").select("id, street_address, purchase_price").in("id", propertyIds)
    : { data: [] as any[] };
  const propertyById = new Map((properties || []).map((p: any) => [p.id, p]));

  const customFieldIds = visibleFieldDefs.filter((f: any) => f.field_source === "custom").map((f: any) => f.field_key);
  const { data: customValues } = customFieldIds.length && projectIds.length
    ? await admin.from("company_custom_field_values")
        .select("field_id, record_id, value_text, value_number, value_date, value_boolean")
        .in("field_id", customFieldIds).in("record_id", projectIds)
    : { data: [] as any[] };
  const customValueByFieldAndRecord = new Map((customValues || []).map((v: any) => [`${v.field_id}:${v.record_id}`, v]));

  const adhocFieldIds = visibleFieldDefs.filter((f: any) => f.field_source === "adhoc").map((f: any) => f.id);
  const { data: adhocValues } = adhocFieldIds.length && itemIds.length
    ? await admin.from("client_update_page_values").select("item_id, field_id, value_text").in("field_id", adhocFieldIds).in("item_id", itemIds)
    : { data: [] as any[] };
  const adhocValueByFieldAndItem = new Map((adhocValues || []).map((v: any) => [`${v.field_id}:${v.item_id}`, v.value_text]));

  function resolveValue(field: any, item: any, project: any): any {
    if (field.field_source === "adhoc") return adhocValueByFieldAndItem.get(`${field.id}:${item.id}`) ?? null;
    if (field.field_source === "custom") {
      const v = customValueByFieldAndRecord.get(`${field.field_key}:${item.project_id}`);
      if (!v) return null;
      return v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
    }
    // base
    const property = project?.property_id ? propertyById.get(project.property_id) : null;
    if (field.field_key === "property_address") return property?.street_address ?? null;
    if (field.field_key === "purchase_price") return property?.purchase_price ?? null;
    return project?.[field.field_key] ?? null;
  }

  const notesByItem = new Map<string, any[]>();
  for (const n of notes || []) {
    if (!notesByItem.has(n.item_id)) notesByItem.set(n.item_id, []);
    notesByItem.get(n.item_id)!.push({ id: n.id, date: n.note_date, body: n.body, author: n.author_name, source: n.source });
  }

  function buildItem(item: any) {
    const project = projectById.get(item.project_id);
    const values: Record<string, any> = {};
    for (const f of visibleFieldDefs) values[f.id] = resolveValue(f, item, project);
    return {
      id: item.id,
      matterName: project?.name ?? "",
      values,
      notes: notesByItem.get(item.id) || [],
    };
  }

  const groups = (groupRows || []).map((g: any) => ({
    id: g.id,
    name: g.name,
    items: (items || []).filter((i: any) => i.group_id === g.id).map(buildItem),
  })).filter(g => g.items.length > 0);

  const ungrouped = (items || []).filter((i: any) => !i.group_id).map(buildItem);

  return NextResponse.json({
    title: page.title,
    clientLabel: page.client_label,
    requiresCode: false,
    fieldDefs: visibleFieldDefs.map((f: any) => ({ id: f.id, label: f.label, fieldSource: f.field_source })),
    groups,
    ungrouped,
  });
}
