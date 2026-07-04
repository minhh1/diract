"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getSchemaMetadata, getCompanyId, deriveLabel, type ColumnMeta } from "@/lib/services/schemaService";
import type { FieldConfig } from "@/components/RecordEditModal";
import type { RelationalEditConfig } from "@/components/MasterTable";
import type { LogParentType } from "@/lib/logging";

export interface TableSchema {
  all: ColumnMeta[];
  displayable: ColumnMeta[];
  dataCols: ColumnMeta[];
  relationCols: ColumnMeta[];
  defaultTableCols: string[];
  editableCols: string[];
  relationalEditCols: Record<string, RelationalEditConfig>;
  editFields: FieldConfig[];
  parentType: LogParentType | null;
  sections: { title: string; fields: { id: string; label: string }[] }[];
  companyId: string | null;
  loading: boolean;
  error: string | null;
}

const PARENT_TYPE_BY_TABLE: Record<string, LogParentType> = {
  properties: 'property',
  entities: 'entity',
  projects: 'project',
};

function deriveFieldType(col: ColumnMeta): FieldConfig['type'] {
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

export function useTableSchema(tableName: string): TableSchema {
  const [all, setAll] = useState<ColumnMeta[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    (async () => {
      const cid = await getCompanyId();
      const cols = await getSchemaMetadata(tableName, cid);
      if (active) {
        setCompanyId(cid);
        setAll(cols);
        setLoading(false);
      }
    })().catch(err => {
      if (active) { setError(err.message); setLoading(false); }
    });

    return () => { active = false; };
  }, [tableName]);

  // Filter out hidden columns and non-displayable categories.
  // is_hidden lets a company hide base fields they don't use.
  const displayable = all.filter(c =>
    (c.category === 'data' || c.category === 'relation') && !c.is_hidden
  );

  const dataCols = all.filter(c => c.category === 'data' && !c.is_hidden);
  const relationCols = all.filter(c => c.category === 'relation' && !c.is_hidden);

  const defaultTableCols = [
    ...dataCols.slice(0, 5).map(c => c.column_name),
    ...relationCols.map(c => c.column_name),
  ].slice(0, 8);

  const editableCols = displayable.map(c => c.column_name);

  const relationalEditCols: Record<string, RelationalEditConfig> = {};
  relationCols.forEach(col => {
    if (!col.relation_table) return;
    const parentType = PARENT_TYPE_BY_TABLE[col.relation_table];
    relationalEditCols[col.column_name] = {
      table: col.relation_table as RelationalEditConfig['table'],
      title: `Select ${col.label || deriveLabel(col.column_name)}`,
      editParentType: parentType || 'entity',
      editFields: [],
    };
  });

  const editFields: FieldConfig[] = dataCols.map(col => {
    const fieldType = deriveFieldType(col);
    const field: FieldConfig = {
      id: col.column_name,
      label: col.label || deriveLabel(col.column_name),
      type: fieldType,
    };
    if (fieldType === 'select' && col.select_table) {
      field.fetchOptions = async () => {
        const { data } = await supabase
          .from(col.select_table!)
          .select(col.select_display_column || 'label')
          .order(col.select_display_column || 'label');
        return (data || []).map((row: any) => ({
          value: row[col.select_display_column || 'label'],
          label: row[col.select_display_column || 'label'],
        }));
      };
    }
    return field;
  });

  const sections = [{
    title: deriveLabel(tableName),
    fields: displayable.map(c => ({
      id: c.column_name,
      label: c.label || deriveLabel(c.column_name),
    })),
  }];

  return {
    all, displayable, dataCols, relationCols,
    defaultTableCols, editableCols, relationalEditCols,
    editFields, parentType: PARENT_TYPE_BY_TABLE[tableName] || null,
    sections, companyId, loading, error,
  };
}