"use client";

// Warms Property Developer Quick Glance's own project+property+sold data
// (see components/dashboard/quickGlance/PropertyDeveloperQuickGlance.tsx) --
// this is a bespoke join across projects/project_properties/properties/
// company_custom_field_values, not a single company_tables row, so none of
// lib/hooks/prefetchShells.ts's generic warmers cover it. Without this every
// visit re-fetched from scratch even once everything else felt instant --
// exactly the "current project count jumps from 0 to the real number" gap
// this closes. Called from lib/companyBootstrap.ts's "shells" step, gated
// to Property Developer companies only (a Law Firm company has nothing to
// warm here). The fetch function is exported and reused directly by
// PropertyDeveloperQuickGlance.tsx's own revalidate-in-background call, so
// there's exactly one query shape to keep in sync, not two.
import { supabase } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/queryCache";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { defaultQuickGlanceWidgets } from "@/lib/dashboardWidgets/defaultQuickGlanceLayout";
import type { QuickGlanceWidget } from "@/lib/dashboardWidgets/quickGlanceTypes";

export interface QuickGlancePropertyRow {
  id: string;
  street_address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  sold: boolean;
}

export interface QuickGlanceProjectRow {
  id: string;
  name: string;
  properties: QuickGlancePropertyRow[];
}

export const quickGlanceProjectsCacheKey = (companyId: string) => `quick_glance_projects_${companyId}`;

export async function fetchQuickGlanceProjects(companyId: string): Promise<QuickGlanceProjectRow[]> {
  const [{ data: projectRows }, { data: junctionRows }] = await Promise.all([
    // parent_project_id IS NULL -- a sub-project (components/dashboard/
    // tabs/SubProjectsTab.tsx) is just a projects row with this set, and
    // it's already represented under its parent in the internal master
    // table (GenericMasterTable.tsx's baby-icon expand). Quick Glance's map
    // is one pin per development, so a sub-project showing up here as its
    // own separate "current project" would double-count/clutter it.
    supabase.from('projects').select('id, name').eq('company_id', companyId).is('deleted_at', null).is('parent_project_id', null),
    supabase.from('project_properties').select('project_id, property_id').eq('company_id', companyId),
  ]);

  const propertyIds = [...new Set((junctionRows || []).map((j: any) => j.property_id as string))];
  const { data: propertyRows } = propertyIds.length
    ? await supabase.from('properties').select('id, street_address, suburb, state, postcode, lat, lng').in('id', propertyIds)
    : { data: [] as any[] };
  const propertyById = new Map(
    (propertyRows || []).map((p: any) => [p.id, { ...p, sold: false } as QuickGlancePropertyRow])
  );

  // "Sold" custom field -- supabase/migrations/20260805020000_properties_sold_custom_field.sql
  const { data: soldField } = await supabase
    .from('company_custom_fields')
    .select('id')
    .eq('company_id', companyId)
    .eq('table_name', 'properties')
    .eq('field_key', 'sold')
    .is('deleted_at', null)
    .maybeSingle();
  if (soldField && propertyIds.length) {
    const { data: soldValues } = await supabase
      .from('company_custom_field_values')
      .select('record_id, value_boolean')
      .eq('field_id', soldField.id)
      .in('record_id', propertyIds);
    (soldValues || []).forEach((v: any) => {
      const prop = propertyById.get(v.record_id);
      if (prop) prop.sold = !!v.value_boolean;
    });
  }

  const propertiesByProject = new Map<string, QuickGlancePropertyRow[]>();
  (junctionRows || []).forEach((j: any) => {
    const prop = propertyById.get(j.property_id);
    if (!prop) return;
    if (!propertiesByProject.has(j.project_id)) propertiesByProject.set(j.project_id, []);
    propertiesByProject.get(j.project_id)!.push(prop);
  });

  return (projectRows || []).map((p: any) => ({
    id: p.id, name: p.name, properties: propertiesByProject.get(p.id) || [],
  }));
}

export async function warmQuickGlanceProjects(companyId: string): Promise<void> {
  const key = quickGlanceProjectsCacheKey(companyId);
  if (readCache(key)) return;
  try {
    writeCache(key, await fetchQuickGlanceProjects(companyId));
  } catch {}
}

// The Quick Glance WIDGET ARRANGEMENT itself (company_quick_glance_layout --
// which bespoke/generic widgets, in what order, at what size) -- distinct
// from fetchQuickGlanceProjects above, which is Property Developer's own
// map data feeding INTO one particular widget. Every company type needs
// this one warmed, not just Property Developer.
//
// Same key components/dashboard/QuickGlanceDashboard.tsx's own
// shellCache read/write already use, and the same "no row yet -> seed the
// default arrangement" fallback that component's load() used to duplicate
// locally -- extracted here (and reused by that component directly, same
// as fetchQuickGlanceProjects/PropertyDeveloperQuickGlance.tsx below) so
// there's exactly one fetch-or-seed shape to keep in sync, not two.
export const quickGlanceShellKey = (companyId: string) => `quick-glance:${companyId}`;

export async function fetchQuickGlanceLayout(companyId: string, companyType: string | null): Promise<QuickGlanceWidget[]> {
  const { data } = await supabase.from('company_quick_glance_layout').select('widgets').eq('company_id', companyId).maybeSingle();
  if (data) return data.widgets || [];
  // No row yet -- seed one with the default arrangement for this company
  // type (mirrors the migration's own backfill for companies that existed
  // before company_quick_glance_layout did).
  const { data: timeFeeEntries } = await supabase
    .from('company_tables').select('id')
    .eq('company_id', companyId).eq('slug', 'time-fee-entries').is('deleted_at', null).maybeSingle();
  const seeded = defaultQuickGlanceWidgets(companyType, timeFeeEntries?.id || null);
  await supabase.from('company_quick_glance_layout').upsert({ company_id: companyId, widgets: seeded });
  return seeded;
}

// Called from lib/companyBootstrap.ts's "shells" step for every company
// (unlike warmQuickGlanceProjects, not gated to Property Developer -- the
// layout row itself is universal even if a couple of unusual company
// shapes end up never actually rendering QuickGlanceDashboard.tsx). Without
// this, AppLoader's splash could dismiss (every OTHER bootstrap step done)
// only for Quick Glance -- almost always the landing page right after --
// to show its own second spinner while this one fetch it never knew to
// warm finally ran. Reported live: exactly that gap, every single load.
export async function warmQuickGlanceLayout(companyId: string, companyType: string | null): Promise<void> {
  const key = quickGlanceShellKey(companyId);
  if (readShellCache(key)) return;
  try {
    writeShellCache(key, await fetchQuickGlanceLayout(companyId, companyType));
  } catch {}
}
