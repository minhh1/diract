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
    supabase.from('projects').select('id, name').eq('company_id', companyId).is('deleted_at', null),
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
