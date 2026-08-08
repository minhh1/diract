import { useQuery } from '@tanstack/react-query';

import { supabase } from '../supabase';
import { systemTablePrimaryDisplayColumn } from '../systemTableRelations';
import { fetchMatterNumbersByProjectId, withMatterNumber } from '../matterNumberDisplay';
import type { CustomTableField, CustomTableRecord } from './customTableTypes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Batch-resolves every relation field's linked-record ids to a human label,
// one query per relation FIELD across all rows (not one per cell) -- a
// mobile port of resolveRelationLabels() in lib/hooks/useCustomTable.ts on
// the web app. Never returns/displays a raw id: DashboardWidgetRenderer.tsx
// shows nothing (a blank dash) for a relation cell until this settles,
// then the real label, or "(removed)" if the link target no longer exists --
// it should never fall through to printing the uuid itself.
export function useResolvedRelationLabels(fields: CustomTableField[], records: CustomTableRecord[]) {
  const relationFields = fields.filter((f) => f.relationSystemTable || f.relationCustomTableId);
  // Stable key: which fields need resolving + which ids they actually hold
  // right now, so this only re-runs when the real inputs change, not on
  // every records refetch that leaves the same ids in place.
  const idsByField = relationFields.map((f) => {
    const raw = records.map((r) => r.values[f.field_key]);
    const ids = Array.from(new Set(raw.flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))));
    return { field: f, ids };
  }).filter((x) => x.ids.length > 0);

  const queryKey = ['relation-labels', idsByField.map((x) => `${x.field.id}:${x.ids.slice().sort().join(',')}`).join('|')];

  const query = useQuery({
    queryKey,
    enabled: idsByField.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, Map<string, string>>> => {
      // fieldKey -> (linkedRecordId -> label)
      const byField = new Map<string, Map<string, string>>();

      await Promise.all(idsByField.map(async ({ field, ids }) => {
        const labelById = new Map<string, string>();

        if (field.relationSystemTable) {
          const displayCol = field.relationDisplayColumn || systemTablePrimaryDisplayColumn(field.relationSystemTable);
          // Built from a runtime column name, not a literal -- PostgREST's
          // select() overload that parses the string into a typed result
          // can't handle that, so this goes through the plain-string
          // overload instead (same reasoning as relationLabels.ts's
          // `column as string`).
          const selectCols: string = `id, ${displayCol}`;
          const { data } = await supabase.from(field.relationSystemTable).select(selectCols).in('id', ids);
          // A linked Matter also gets its per-company matter number
          // prepended -- see matterNumberDisplay.ts's header comment. Never
          // lets a failure here (e.g. a transient network error) take down
          // label resolution for every OTHER relation field in the same
          // Promise.all -- this whole grid degrading to raw "(removed)"-less
          // blanks over a number-prefix enhancement failing would be a much
          // worse outcome than just showing names without their numbers.
          let numberById = new Map<string, string>();
          if (field.relationSystemTable === 'projects') {
            try {
              numberById = await fetchMatterNumbersByProjectId(ids);
            } catch (err) {
              console.error('[relationResolution] fetchMatterNumbersByProjectId failed:', err);
            }
          }
          (data ?? []).forEach((row: any) => {
            const label = (row as Record<string, unknown>)[displayCol];
            if (label != null) labelById.set(row.id as string, withMatterNumber(String(label), numberById.get(row.id)));
          });
        } else if (field.relationCustomTableId) {
          const { data: targetFields } = await supabase
            .from('company_table_fields')
            .select('id, field_key')
            .eq('table_id', field.relationCustomTableId)
            .is('deleted_at', null);
          const displayField = (targetFields ?? []).find((f) => f.field_key === field.relationDisplayColumn) ?? (targetFields ?? [])[0];
          if (displayField) {
            const { data: values } = await supabase
              .from('company_table_values')
              .select('record_id, value_text, value_number, value_date, value_boolean')
              .eq('field_id', displayField.id)
              .in('record_id', ids);
            (values ?? []).forEach((v: Record<string, unknown>) => {
              const label = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? String(v.value_boolean) : null);
              if (label != null) labelById.set(v.record_id as string, String(label));
            });
          }
        }

        byField.set(field.field_key, labelById);
      }));

      return byField;
    },
  });

  return query.data ?? new Map<string, Map<string, string>>();
}

// Merges a resolved-labels map (from useResolvedRelationLabels) onto each
// record's displayValues -- allow_multiple relation fields (values[key] is
// a string[]) join their resolved labels with ", ".
export function withDisplayValues(records: CustomTableRecord[], labelsByField: Map<string, Map<string, string>>): CustomTableRecord[] {
  if (labelsByField.size === 0) return records;
  return records.map((r) => {
    const displayValues: Record<string, string> = {};
    labelsByField.forEach((labelById, fieldKey) => {
      const raw = r.values[fieldKey];
      if (Array.isArray(raw)) {
        const labels = raw.map((id) => labelById.get(id)).filter((l): l is string => !!l);
        if (labels.length) displayValues[fieldKey] = labels.join(', ');
      } else if (typeof raw === 'string') {
        const label = labelById.get(raw);
        if (label) displayValues[fieldKey] = label;
      }
    });
    return { ...r, displayValues };
  });
}
