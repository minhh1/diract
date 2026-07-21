"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  getSchemaMetadata, getCompanyId, deriveLabel,
  getCachedSchemaMetadata, getCachedCompanyIdSync,
  type ColumnMeta,
} from "@/lib/services/schemaService";
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
  // Lazy initializers run synchronously on first render (unlike useEffect,
  // which always waits a tick) — so a table already visited this session
  // renders with its real schema immediately instead of flashing "loading"
  // for one frame on every remount (e.g. switching Properties → Entities).
  const [all, setAll] = useState<ColumnMeta[]>(() => {
    const { resolved, companyId: cid } = getCachedCompanyIdSync();
    return resolved ? (getCachedSchemaMetadata(tableName, cid) ?? []) : [];
  });
  const [companyId, setCompanyId] = useState<string | null>(() => {
    const { resolved, companyId: cid } = getCachedCompanyIdSync();
    return resolved ? cid : null;
  });
  const [loading, setLoading] = useState(() => {
    const { resolved, companyId: cid } = getCachedCompanyIdSync();
    return !resolved || getCachedSchemaMetadata(tableName, cid) === null;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const cid = await getCompanyId();
        const cols = await getSchemaMetadata(tableName, cid);
        if (active) {
          setCompanyId(cid);
          setAll(cols);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();

    return () => { active = false; };
  }, [tableName]); // only tableName — getCompanyId/getSchemaMetadata are stable cached functions

  const displayable = useMemo(() =>
    all.filter(c => (c.category === 'data' || c.category === 'relation') && !c.is_hidden),
    [all]
  );

  const dataCols = useMemo(() =>
    all.filter(c => c.category === 'data' && !c.is_hidden),
    [all]
  );

  const relationCols = useMemo(() =>
    all.filter(c => c.category === 'relation' && !c.is_hidden),
    [all]
  );

  const defaultTableCols = useMemo(() => [
    ...dataCols.slice(0, 5).map(c => c.column_name),
    ...relationCols.map(c => c.column_name),
  ].slice(0, 8), [dataCols, relationCols]);

  const editableCols = useMemo(() =>
    displayable.map(c => c.column_name),
    [displayable]
  );

  const relationalEditCols = useMemo(() => {
    const result: Record<string, RelationalEditConfig> = {};
    relationCols.forEach(col => {
      if (!col.relation_table) return;
      const parentType = PARENT_TYPE_BY_TABLE[col.relation_table];
      result[col.column_name] = {
        table: col.relation_table as RelationalEditConfig['table'],
        title: `Select ${col.label || deriveLabel(col.column_name)}`,
        editParentType: parentType || 'entity',
        editFields: [],
      };
    });
    return result;
  }, [relationCols]);

  const editFields = useMemo(() => dataCols.map(col => {
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
  }), [dataCols]);

  const sections = useMemo(() => [{
    title: deriveLabel(tableName),
    fields: displayable.map(c => ({
      id: c.column_name,
      label: c.label || deriveLabel(c.column_name),
    })),
  }], [tableName, displayable]);

  return {
    all, displayable, dataCols, relationCols,
    defaultTableCols, editableCols, relationalEditCols,
    editFields, parentType: PARENT_TYPE_BY_TABLE[tableName] || null,
    sections, companyId, loading, error,
  };
}