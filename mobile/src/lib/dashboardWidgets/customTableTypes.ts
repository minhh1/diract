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
};

export type CustomTableRecord = {
  id: string;
  values: Record<string, unknown>;
};
