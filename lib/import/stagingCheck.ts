import { supabase } from "@/lib/supabase";

export interface StagingFlag {
  staging_row_index: number;
  matched_against: 'existing' | 'same_batch';
  matched_identifier: string;
  matched_id: string | null;   // <-- this is the field that's missing
  match_score?: number;
  match_reason: string;
}

interface StagedPropertyRow {
  row_index: number;
  street_address: string;
  suburb: string;
  state: string;
  postcode: string;
  purchase_price: number | null;
  purchase_date: string | null;
  entity_name: string | null;
  raw_payload: Record<string, any>;
}

export async function stageAndCheckProperties(
  batchId: string,
  userId: string,
  companyId: string,
  rows: StagedPropertyRow[]
): Promise<StagingFlag[]> {
  // Insert in chunks to stay well under any request-size limits on large files
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(r => ({
      batch_id: batchId, user_id: userId, company_id: companyId,
      row_index: r.row_index, street_address: r.street_address, suburb: r.suburb,
      state: r.state, postcode: r.postcode, purchase_price: r.purchase_price,
      purchase_date: r.purchase_date, entity_name: r.entity_name, raw_payload: r.raw_payload,
    }));
    const { error } = await supabase.from('import_staging_properties').insert(chunk);
    if (error) {
      console.error('stageAndCheckProperties insert error:', error);
      throw error;
    }
  }

  const { data, error } = await supabase.rpc('find_staging_property_duplicates', {
    p_batch_id: batchId,
    target_company_id: companyId,
    similarity_threshold: 0.6,
  });

  if (error) {
    console.error('find_staging_property_duplicates error:', error);
    return [];
  }
  return data || [];
}

interface StagedEntityRow {
  row_index: number;
  name: string;
  raw_payload: Record<string, any>;
}

export async function stageAndCheckEntities(
  batchId: string,
  userId: string,
  companyId: string,
  rows: StagedEntityRow[]
): Promise<StagingFlag[]> {
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map(r => ({
      batch_id: batchId, user_id: userId, company_id: companyId,
      row_index: r.row_index, name: r.name, raw_payload: r.raw_payload,
    }));
    const { error } = await supabase.from('import_staging_entities').insert(chunk);
    if (error) {
      console.error('stageAndCheckEntities insert error:', error);
      throw error;
    }
  }

  const { data, error } = await supabase.rpc('find_staging_entity_duplicates', {
    p_batch_id: batchId,
    target_company_id: companyId,
  });

  if (error) {
    console.error('find_staging_entity_duplicates error:', error);
    return [];
  }
  return data || [];
}

export async function clearStaging(batchId: string) {
  const { error } = await supabase.rpc('clear_import_staging', { p_batch_id: batchId });
  if (error) console.error('clearStaging error:', error);
}