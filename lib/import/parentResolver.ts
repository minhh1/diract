import { supabase } from "@/lib/supabase";

export interface ParentResolution {
  id: string | null;
  wasCreated: boolean;
  error?: string;
}

/**
 * Resolves a property_street_address reference (and optional suburb) to a
 * real properties.id, scoped to this company. If no match exists, creates
 * a minimal property record from what's available and flags it as
 * newly-created so the review step can surface "this property record was
 * auto-created with minimal details — fill in the rest later."
 */
export async function resolvePropertyParent(
  companyId: string,
  streetAddress: string,
  suburb?: string
): Promise<ParentResolution> {
  if (!streetAddress) return { id: null, wasCreated: false, error: "No property reference provided" };

  let query = supabase
    .from('properties')
    .select('id')
    .eq('company_id', companyId)
    .ilike('street_address', streetAddress.trim())
    .is('deleted_at', null);

  if (suburb) query = query.ilike('suburb', suburb.trim());

  const { data: existing } = await query.limit(1).single();
  if (existing) return { id: existing.id, wasCreated: false };

  const { data: created, error } = await supabase
    .from('properties')
    .insert({ company_id: companyId, street_address: streetAddress.trim(), suburb: suburb?.trim() || null })
    .select('id')
    .single();

  if (error) return { id: null, wasCreated: false, error: error.message };
  return { id: created.id, wasCreated: true };
}

/**
 * Resolves an entity_name (+ optional entity_type) to a real entities.id,
 * creating a minimal entity record if none matches. Reused both for the
 * "parent entity" case (entities-mode child sections) and for "provider
 * entity" resolution on bills/credentials.
 */
export async function resolveEntityParent(
  companyId: string,
  entityName: string,
  entityType?: string
): Promise<ParentResolution> {
  if (!entityName) return { id: null, wasCreated: false, error: "No entity reference provided" };

  const { data: existing } = await supabase
    .from('entities')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', entityName.trim())
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (existing) return { id: existing.id, wasCreated: false };

  const { data: created, error } = await supabase
    .from('entities')
    .insert({ company_id: companyId, name: entityName.trim(), entity_type: entityType || 'Company' })
    .select('id')
    .single();

  if (error) return { id: null, wasCreated: false, error: error.message };
  return { id: created.id, wasCreated: true };
}

export async function resolveProjectParent(
  companyId: string,
  projectName: string
): Promise<ParentResolution> {
  if (!projectName) return { id: null, wasCreated: false, error: "No project reference provided" };

  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', projectName.trim())
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (existing) return { id: existing.id, wasCreated: false };

  const { data: created, error } = await supabase
    .from('projects')
    .insert({ company_id: companyId, name: projectName.trim() })
    .select('id')
    .single();

  if (error) return { id: null, wasCreated: false, error: error.message };
  return { id: created.id, wasCreated: true };
}