// Minimal subset of lib/hooks/useCustomTable.ts's CustomTableField/
// CustomTableRecord on the web app -- just the properties compute.ts (see
// its own copy in this directory) and DashboardWidgetRenderer.tsx actually
// read. Field-id convention matches exactly (verified against
// lib/hooks/useSystemTableAsCustomTable.ts's own header comment): a native
// column's id/field_key is the column name; a company_custom_fields row's
// id/field_key is that row's own uuid. mobile/src/lib/records.ts's
// RecordField already uses this identical convention (see its own `key`
// field doc), so companyDashboards.ts's adapter is a straight rename, not a
// re-derivation.
export type CustomTableField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  // Relation resolution info, set only for entity/project/property/
  // table_relation fields -- see dashboardWidgets/relationResolution.ts.
  // Exactly one of relationSystemTable/relationCustomTableId is set for a
  // resolvable relation field (never both); both null for anything else.
  relationSystemTable?: string | null;
  relationCustomTableId?: string | null;
  relationDisplayColumn?: string | null;
  // Write-path metadata (customTableWrite.ts/CustomTableQuickAddForm.tsx) --
  // undefined everywhere else (companyDashboards.ts's system-table adapter
  // doesn't set these; that path writes through lib/recordsWrite.ts instead,
  // which doesn't need them).
  select_options?: string[] | null;
  formula_type?: 'multiply' | 'percentage_of' | 'add' | 'subtract' | 'divide' | 'sum_related' | 'max_related' | null;
  formula_field_a_id?: string | null;
  formula_field_b_id?: string | null;
  formula_percent?: number | null;
};

export type CustomTableRecord = {
  id: string;
  values: Record<string, unknown>;
  // field_key -> resolved human label, relation fields only -- populated by
  // relationResolution.ts's useResolvedRelationLabels, empty until that
  // query settles. Mirrors lib/hooks/useCustomTable.ts's displayValues on
  // the web app.
  displayValues?: Record<string, string>;
};
