// app/api/templates/[slug]/export/route.ts
// Single entry point for "Add to template" (components/marketplace/
// AddToTemplateModal.tsx) -- replaces three separate scattered "Publish to
// marketplace" buttons (CustomTableBuilder.tsx, SchemaVisualisation.tsx,
// the old "Sync dashboards" button) that each duplicated their own
// always-create-a-new-template logic. Optionally creates a new draft
// template, then dispatches to whichever sync_template_*_from_company RPCs
// (supabase/migrations/20260808180000_add_to_template_consolidation.sql)
// correspond to non-empty selections, via the caller's OWN session client
// (not the service-role admin client) so each RPC's own SECURITY DEFINER
// company-membership check applies -- same reasoning as sync-dashboards/
// route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

interface ExportSelections {
  tablesVisibility?: boolean;
  tableIds?: string[];
  systemFields?: Partial<Record<"projects" | "entities" | "properties", string[]>>;
  dashboardIds?: string[];
  recordTabIds?: string[];
  defaultViewIds?: string[];
  pages?: { detailedTable?: string[]; publicTask?: string[]; documentFillPack?: string[] };
  settings?: { tableLabelOverrides?: boolean; invoiceSettings?: boolean };
}

function slugify(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-")}-${Date.now().toString(36)}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { slug } = await params;

  const body = await req.json().catch(() => ({}));
  const createNew: { name: string; description?: string; industry?: string } | undefined = body.createNew;
  const selections: ExportSelections = body.selections || {};

  let templateId: string;
  let templateSlug: string;

  if (createNew) {
    if (!createNew.name?.trim()) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    templateSlug = slugify(createNew.name);
    const { data: created, error } = await admin.from("template_definitions").insert({
      slug: templateSlug, name: createNew.name.trim(), description: createNew.description?.trim() || null,
      industry: createNew.industry?.trim() || null, owner_company_id: companyId, is_published: false,
    }).select("id, slug").single();
    if (error || !created) return NextResponse.json({ error: error?.message || "Could not create template" }, { status: 500 });
    templateId = created.id;
    templateSlug = created.slug;
  } else {
    const { data: template } = await admin.from("template_definitions").select("id, slug, owner_company_id").eq("slug", slug).maybeSingle();
    if (!template || template.owner_company_id !== companyId) {
      return NextResponse.json({ error: "Only the template's owner company can add to it" }, { status: 403 });
    }
    templateId = template.id;
    templateSlug = template.slug;
  }

  const supabase = await createSupabaseServerClient();
  const results: Record<string, any> = {};
  const errors: string[] = [];

  // supabase.rpc() returns a thenable query builder, not a real Promise (no
  // real .catch()) -- awaited directly here rather than chained, same
  // caveat noted throughout this codebase's Edge Functions.
  const run = async (key: string, builder: PromiseLike<{ error: any; data: any }>) => {
    const { data, error } = await builder;
    if (error) errors.push(`${key}: ${error.message}`);
    else results[key] = data;
  };

  if (selections.tableIds?.length) {
    await run("tables", supabase.rpc("sync_template_tables_from_company", { p_template_id: templateId, p_table_ids: selections.tableIds }));
  }
  for (const tableName of ["projects", "entities", "properties"] as const) {
    const fieldIds = selections.systemFields?.[tableName];
    if (fieldIds?.length) {
      await run(`systemFields:${tableName}`, supabase.rpc("sync_template_system_fields_from_company", {
        p_template_id: templateId, p_table_name: tableName, p_field_ids: fieldIds,
      }));
    }
  }
  if (selections.dashboardIds?.length || selections.recordTabIds?.length) {
    await run("dashboards", supabase.rpc("sync_template_dashboards_from_company", {
      p_template_id: templateId,
      p_dashboard_ids: selections.dashboardIds?.length ? selections.dashboardIds : [],
      p_record_tab_ids: selections.recordTabIds?.length ? selections.recordTabIds : [],
    }));
  }
  if (selections.defaultViewIds?.length) {
    await run("defaultViews", supabase.rpc("sync_template_default_views_from_company", { p_template_id: templateId, p_view_ids: selections.defaultViewIds }));
  }
  const pages = selections.pages;
  if (pages?.detailedTable?.length || pages?.publicTask?.length || pages?.documentFillPack?.length) {
    await run("pages", supabase.rpc("sync_template_pages_from_company", {
      p_template_id: templateId,
      p_detailed_table_page_ids: pages.detailedTable?.length ? pages.detailedTable : [],
      p_public_task_page_ids: pages.publicTask?.length ? pages.publicTask : [],
      p_document_fill_page_ids: pages.documentFillPack?.length ? pages.documentFillPack : [],
    }));
  }
  if (selections.tablesVisibility || selections.settings?.tableLabelOverrides || selections.settings?.invoiceSettings) {
    await run("settings", supabase.rpc("sync_template_settings_from_company", {
      p_template_id: templateId,
      p_include: {
        tableLabelOverrides: !!selections.settings?.tableLabelOverrides,
        invoiceSettings: !!selections.settings?.invoiceSettings,
        tablesVisibility: !!selections.tablesVisibility,
      },
    }));
  }

  if (errors.length) return NextResponse.json({ error: errors.join("; "), results }, { status: 400 });
  return NextResponse.json({ ok: true, templateId, slug: templateSlug, results });
}
