// lib/genericRecordActions.ts
import { supabase } from "@/lib/supabase";
import { logActivity, type LogParentType } from "@/lib/logging";

interface UpdateRecordParams {
  table: string;
  id: string;
  changes: Record<string, any>;
  parentType: LogParentType;
  parentId: string;
  companyId: string;
  recordLabel?: string;
}

export async function updateRecord({
  table, id, changes, parentType, parentId, companyId, recordLabel,
}: UpdateRecordParams): Promise<{ error: any }> {
  const fieldNames = Object.keys(changes);

  const { data: before } = await supabase
    .from(table)
    .select(fieldNames.join(','))
    .eq('id', id)
    .single();

  const { error } = await supabase.from(table).update(changes).eq('id', id);

  if (error) return { error };

  const changeSummary = fieldNames.map(f => ({
    field: f,
    old: (before as any)?.[f] ?? null,
    new: changes[f],
  }));

  await logActivity({
    parentType, parentId, companyId,
    action: `updated ${recordLabel ? recordLabel + ' — ' : ''}${fieldNames.join(', ').replace(/_/g, ' ')}`,
    details: { table, recordId: id, changes: changeSummary },
  });

  return { error: null };
}

interface SoftDeleteParams {
  table: string;
  id: string;
  parentType: LogParentType;
  parentId: string;
  companyId: string;
  recordLabel?: string;
}

export async function softDeleteRecord({
  table, id, parentType, parentId, companyId, recordLabel,
}: SoftDeleteParams): Promise<{ error: any }> {
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error };

  await logActivity({
    parentType, parentId, companyId,
    action: `archived${recordLabel ? ' ' + recordLabel : ''}`,
    details: { table, recordId: id },
  });

  return { error: null };
}