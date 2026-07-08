// lib/import/commitImport.ts
import { supabase } from "@/lib/supabase";
import { resolvePropertyParent, resolveEntityParent } from "@/lib/import/parentResolver";
import type { ImportSection } from "@/lib/import/buildTemplate";
import type { ParsedRow } from "@/lib/import/parseImportFile";

export type RowAction = "include" | "skip" | "update";

export interface ImportRowResult {
  id: string;
  status: "new" | "updated" | "failed" | "reversed";
  identifier: string;
  message?: string;
  details?: any;
  customFields?: Record<string, string>;
}

interface CommitContext {
  companyId: string;
  userId: string;
  batchId: string;
  baseMode: "properties" | "entities" | "projects";
  rowUpdateTarget: Map<number, string>;
}

// ── Columns that must never be written directly to base tables ─────
const SKIP_BASE_COLS = new Set([
  'full_address',
  'entity_name',
  'entity_type',
  'provider_entity_name',
  'provider_entity_type',
  'property_street_address',
  'property_suburb',
  'property_state',
  'property_postcode',
  'property_country',
]);

// ── Save custom EAV field values ───────────────────────────────────
async function saveCustomFieldValues(
  recordId: string,
  tableName: string,
  companyId: string,
  customFields: Record<string, string>
) {
  const entries = Object.entries(customFields).filter(([, v]) => v?.trim());
  if (!entries.length) return;

  const fieldIds = entries.map(([id]) => id);
  const { data: fieldMeta } = await supabase
    .from('company_custom_fields')
    .select('id, field_type')
    .in('id', fieldIds);

  const typeMap = new Map((fieldMeta || []).map(f => [f.id, f.field_type]));

  const upserts = entries.map(([fieldId, value]) => {
    const fieldType = typeMap.get(fieldId) || 'text';
    const valueCol =
      ['number', 'currency'].includes(fieldType) ? 'value_number'
      : fieldType === 'date' ? 'value_date'
      : fieldType === 'boolean' ? 'value_boolean'
      : 'value_text';
    return {
      company_id: companyId,
      field_id: fieldId,
      record_id: recordId,
      table_name: tableName,
      [valueCol]: value,
    };
  });

  await supabase
    .from('company_custom_field_values')
    .upsert(upserts, { onConflict: 'field_id,record_id' });
}

// ── Save cross-table related field values ──────────────────────────
async function saveRelatedFields(
  recordId: string,
  baseTable: string,
  relatedFields: Record<string, Record<string, string>>,
  section: ImportSection,
  companyId: string
) {
  if (!Object.keys(relatedFields).length) return;

  const fkCols = Object.keys(relatedFields).map(alias => `${alias}_id`);
  const { data: record } = await supabase
    .from(baseTable)
    .select(fkCols.join(','))
    .eq('id', recordId)
    .single();

  if (!record) return;

  const crossTableMeta = (section as any).crossTableFields || [];

  await Promise.all(
    Object.entries(relatedFields).map(async ([alias, fields]) => {
      const fkCol = `${alias}_id`;
      const linkedId = (record as Record<string, any>)[fkCol];
      if (!linkedId) return;

      const meta = crossTableMeta.find((f: any) => f.alias === alias);
      if (!meta) return;

      const updatePayload: Record<string, any> = {};
      Object.entries(fields).forEach(([fieldName, value]) => {
        if (value?.trim()) updatePayload[fieldName] = value;
      });
      if (!Object.keys(updatePayload).length) return;

      await supabase
        .from(meta.sourceTable)
        .update(updatePayload)
        .eq('id', linkedId);
    })
  );
}

// ── Resolve or create linked property for projects ─────────────────
async function resolveOrCreateProperty(
  companyId: string,
  streetAddress: string,
  suburb: string | null,
  state: string | null,
  postcode: string | null,
  country: string | null
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('properties')
    .select('id')
    .eq('company_id', companyId)
    .ilike('street_address', streetAddress.trim())
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (existing) {
    const updates: Record<string, any> = {};
    if (suburb) updates.suburb = suburb;
    if (state) updates.state = state;
    if (postcode) updates.postcode = postcode;
    if (country) updates.country = country;
    if (Object.keys(updates).length > 0) {
      await supabase.from('properties').update(updates).eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: newProp } = await supabase
    .from('properties')
    .insert({
      company_id: companyId,
      street_address: streetAddress.trim(),
      suburb: suburb || null,
      state: state || null,
      postcode: postcode || null,
      country: country || 'Australia',
    })
    .select('id')
    .single();

  return newProp?.id || null;
}

// ── commitBaseRow ──────────────────────────────────────────────────

export async function commitBaseRow(
  row: ParsedRow,
  action: RowAction,
  ctx: CommitContext,
  section?: ImportSection
): Promise<ImportRowResult> {
  const { companyId, userId, batchId, baseMode } = ctx;

  const obj: Record<string, any> = {
    company_id: companyId,
    import_id: batchId,
  };

  let eName = '';
  let eType = '';

  // Build base object — skip non-column keys
  Object.entries(row.parsed).forEach(([header, val]) => {
    if (SKIP_BASE_COLS.has(header)) return;
    if (header === 'entity_name') { eName = String(val ?? ''); return; }
    if (header === 'entity_type') {
      eType = String(val ?? '');
      if (baseMode !== 'entities') return;
    }
    if (val === null || val === undefined || val === '') return;
    obj[header] = val;
  });

  // ── Properties — resolve holding entity ───────────────────────
  if (baseMode === 'properties' && eName) {
    const { data: ent } = await supabase
      .from('entities')
      .upsert(
        { name: eName, entity_type: eType || 'Company', company_id: companyId },
        { onConflict: 'company_id,name' }
      )
      .select('id')
      .single();
    if (ent) obj.holding_entity_id = ent.id;
  }

  if (baseMode === 'entities') {
    obj.name = eName || obj.name;
    obj.entity_type = eType || obj.entity_type;
  }

  // ── Projects — resolve or create linked property ──────────────
  if (baseMode === 'projects') {
    const streetAddress = row.parsed.property_street_address;
    if (streetAddress?.trim()) {
      const propertyId = await resolveOrCreateProperty(
        companyId,
        streetAddress,
        row.parsed.property_suburb || null,
        row.parsed.property_state || null,
        row.parsed.property_postcode || null,
        row.parsed.property_country || 'Australia'
      );
      if (propertyId) obj.property_id = propertyId;
    }
  }

  const linkCol =
    baseMode === 'properties' ? 'property_id'
    : baseMode === 'entities' ? 'entity_id'
    : 'project_id';

  const identifier = obj.street_address || obj.name || `Row ${row.rowIndex}`;

  // ── Update existing record ─────────────────────────────────────
  if (action === 'update') {
    const targetId = ctx.rowUpdateTarget.get(row.rowIndex);
    if (!targetId) {
      return {
        id: '', status: 'failed', identifier,
        message: 'No existing record found to update against',
        details: obj,
        customFields: row.customFields || {},
      };
    }

    const updatePayload: Record<string, any> = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (key === 'company_id' || key === 'import_id') return;
      const isEmpty =
        value === null || value === undefined || value === '' ||
        (key === 'purchase_price' && value === 0);
      if (!isEmpty) updatePayload[key] = value;
    });

    if (Object.keys(updatePayload).length === 0) {
      return {
        id: targetId, status: 'updated', identifier,
        message: 'No non-empty fields to update',
        details: obj,
        customFields: row.customFields || {},
      };
    }

    const { data: rec, error } = await supabase
      .from(baseMode)
      .update(updatePayload)
      .eq('id', targetId)
      .select('id')
      .single();

    if (error) {
      return {
        id: targetId, status: 'failed', identifier,
        message: error.message,
        details: updatePayload,
        customFields: row.customFields || {},
      };
    }

    await supabase.from('audit_logs').insert([{
      company_id: companyId, user_id: userId,
      [linkCol]: rec.id,
      action: 'bulk import updated existing record',
      details: updatePayload,
    }]);

    if (rec.id) {
      if (row.customFields && Object.keys(row.customFields).length) {
        await saveCustomFieldValues(rec.id, baseMode, companyId, row.customFields);
      }
      if (row.relatedFields && Object.keys(row.relatedFields).length && section) {
        await saveRelatedFields(rec.id, baseMode, row.relatedFields, section, companyId);
      }
    }

    return {
      id: rec.id, status: 'updated', identifier,
      details: updatePayload,
      customFields: row.customFields || {},
    };
  }

  // ── Insert new record ──────────────────────────────────────────
  const { data: rec, error } = await supabase
    .from(baseMode)
    .insert(obj)
    .select('id')
    .single();

  if (error) {
    return {
      id: '', status: 'failed', identifier,
      message: error.message,
      details: obj,
      customFields: row.customFields || {},
    };
  }

  await supabase.from('audit_logs').insert([{
    company_id: companyId, user_id: userId,
    [linkCol]: rec.id,
    action: 'bulk imported record',
    details: obj,
  }]);

  if (rec.id) {
    if (row.customFields && Object.keys(row.customFields).length) {
      await saveCustomFieldValues(rec.id, baseMode, companyId, row.customFields);
    }
    if (row.relatedFields && Object.keys(row.relatedFields).length && section) {
      await saveRelatedFields(rec.id, baseMode, row.relatedFields, section, companyId);
    }
  }

  return {
    id: rec.id, status: 'new', identifier,
    details: obj,
    customFields: row.customFields || {},
  };
}

// ── commitChildRow ─────────────────────────────────────────────────

export async function commitChildRow(
  row: ParsedRow,
  section: ImportSection,
  action: RowAction,
  ctx: CommitContext
): Promise<ImportRowResult> {
  const { companyId, userId, rowUpdateTarget } = ctx;
  const refAddress = row.parsed.property_street_address;
  const refSuburb = row.parsed.property_suburb;

  let parentId: string | null = null;
  if (section.parentKey === 'property_id') {
    const res = await resolvePropertyParent(companyId, refAddress, refSuburb);
    if (res.error || !res.id) {
      return {
        id: '', status: 'failed',
        identifier: refAddress || `Row ${row.rowIndex}`,
        message: res.error || 'Could not resolve or create parent property',
        details: row.parsed,
        customFields: row.customFields || {},
      };
    }
    parentId = res.id;
  }

  const obj: any = { ...section.fixedValues };
  Object.entries(row.parsed).forEach(([key, val]) => {
    if (SKIP_BASE_COLS.has(key)) return;
    obj[key] = val;
  });
  obj[section.parentKey] = parentId;

  if (row.parsed.provider_entity_name) {
    const res = await resolveEntityParent(
      companyId,
      row.parsed.provider_entity_name,
      row.parsed.provider_entity_type
    );
    if (section.targetTable === 'property_credentials') {
      obj.entity_id = res.id;
    } else {
      obj.provider_entity_id = res.id;
    }
  }

  const targetId = rowUpdateTarget.get(row.rowIndex);
  const identifier = refAddress || `Row ${row.rowIndex}`;

  if (action === 'update' && targetId) {
    const updatePayload: Record<string, any> = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (key === section.parentKey) return;
      const isEmpty =
        value === null || value === undefined || value === '' ||
        (typeof value === 'number' && value === 0);
      if (!isEmpty) updatePayload[key] = value;
    });

    if (Object.keys(updatePayload).length === 0) {
      return {
        id: targetId, status: 'updated', identifier,
        message: 'No non-empty fields to update',
        details: obj,
        customFields: row.customFields || {},
      };
    }

    const { data: rec, error } = await supabase
      .from(section.targetTable)
      .update(updatePayload)
      .eq('id', targetId)
      .select('id')
      .single();

    if (error) {
      return {
        id: targetId, status: 'failed', identifier,
        message: error.message,
        details: updatePayload,
        customFields: row.customFields || {},
      };
    }

    await supabase.from('audit_logs').insert([{
      company_id: companyId, user_id: userId, property_id: parentId,
      action: `bulk import updated ${section.title.toLowerCase()}`,
      details: updatePayload,
    }]);

    if (rec.id) {
      if (row.customFields && Object.keys(row.customFields).length) {
        await saveCustomFieldValues(rec.id, section.targetTable, companyId, row.customFields);
      }
      if (row.relatedFields && Object.keys(row.relatedFields).length) {
        await saveRelatedFields(rec.id, section.targetTable, row.relatedFields, section, companyId);
      }
    }

    return {
      id: rec.id, status: 'updated', identifier,
      details: updatePayload,
      customFields: row.customFields || {},
    };
  }

  // Insert new child row
  const { data: rec, error } = await supabase
    .from(section.targetTable)
    .insert(obj)
    .select('id')
    .single();

  if (error) {
    return {
      id: '', status: 'failed', identifier,
      message: error.message,
      details: obj,
      customFields: row.customFields || {},
    };
  }

  await supabase.from('audit_logs').insert([{
    company_id: companyId, user_id: userId, property_id: parentId,
    action: `bulk imported ${section.title.toLowerCase()}`,
    details: obj,
  }]);

  if (rec.id) {
    if (row.customFields && Object.keys(row.customFields).length) {
      await saveCustomFieldValues(rec.id, section.targetTable, companyId, row.customFields);
    }
    if (row.relatedFields && Object.keys(row.relatedFields).length) {
      await saveRelatedFields(rec.id, section.targetTable, row.relatedFields, section, companyId);
    }
  }

  return {
    id: rec.id, status: 'new', identifier,
    details: obj,
    customFields: row.customFields || {},
  };
}