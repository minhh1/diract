// lib/hooks/useRelationalEditFields.ts
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getSchemaMetadata, deriveLabel } from "@/lib/services/schemaService";
import type { RelationalEditConfig } from "@/components/MasterTable";
import type { FieldConfig } from "@/components/RecordEditModal";
import type { LogParentType } from "@/lib/logging";

const PARENT_TYPE_BY_TABLE: Record<string, LogParentType> = {
  properties: 'property',
  entities: 'entity',
  projects: 'project',
};

function deriveFieldType(col: any): FieldConfig['type'] {
  if (col.select_table) return 'select';
  switch (col.data_type) {
    case 'boolean': return 'checkbox';
    case 'date':
    case 'timestamp with time zone':
    case 'timestamp without time zone': return 'date';
    case 'numeric':
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'real':
    case 'double precision': return 'number';
    default: return 'text';
  }
}

/**
 * Takes the base relationalEditCols from useTableSchema (which has
 * empty editFields) and enriches each entry by fetching the linked
 * table's own schema metadata — so RecordEditModal receives a real
 * field list rather than an empty form.
 */
export function useRelationalEditFields(
  baseRelationalEditCols: Record<string, RelationalEditConfig>
): Record<string, RelationalEditConfig> {
  const [enriched, setEnriched] = useState<Record<string, RelationalEditConfig>>(
    baseRelationalEditCols
  );

  useEffect(() => {
    if (Object.keys(baseRelationalEditCols).length === 0) return;

    // Collect unique linked tables to avoid fetching the same schema twice
    // (e.g. holding_entity_id and purchase_entity_id both link to entities).
    const uniqueTables = new Set(
      Object.values(baseRelationalEditCols).map(c => c.table)
    );

    Promise.all(
      [...uniqueTables].map(table => getSchemaMetadata(table))
    ).then(results => {
      const schemaByTable: Record<string, any[]> = {};
      [...uniqueTables].forEach((table, i) => {
        schemaByTable[table] = results[i];
      });

      const next: Record<string, RelationalEditConfig> = {};
      Object.entries(baseRelationalEditCols).forEach(([colId, config]) => {
        const linkedSchema = schemaByTable[config.table] || [];
        // Only data columns become editable fields — not identity,
        // metadata, sensitive, or relation columns on the linked table.
        const editFields: FieldConfig[] = linkedSchema
          .filter(c => c.category === 'data')
          .map(c => {
            const fieldType = deriveFieldType(c);
            const field: FieldConfig = {
              id: c.column_name,
              label: c.label || deriveLabel(c.column_name),
              type: fieldType,
            };
            if (fieldType === 'select' && c.select_table) {
              field.fetchOptions = async () => {
                const { data } = await supabase
                  .from(c.select_table)
                  .select(c.select_display_column || 'label')
                  .order(c.select_display_column || 'label');
                return (data || []).map((row: any) => ({
                  value: row[c.select_display_column || 'label'],
                  label: row[c.select_display_column || 'label'],
                }));
              };
            }
            return field;
          });

        next[colId] = {
          ...config,
          editParentType: PARENT_TYPE_BY_TABLE[config.table] || 'entity',
          editFields,
        };
      });

      setEnriched(next);
    });
  }, [JSON.stringify(Object.keys(baseRelationalEditCols))]); // eslint-disable-line

  return enriched;
}