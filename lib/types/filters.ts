// lib/types/filters.ts
export type FilterOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with'
  | 'is_empty' | 'is_not_empty'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_true' | 'is_false';

export interface ActiveFilter {
  fieldId: string;      // column id e.g. 'status' or 'custom_field:uuid'
  label: string;        // display label e.g. 'Status'
  operator: FilterOperator;
  value: string;        // always string — cast on apply
  fieldType: string;    // 'text', 'select', 'boolean', 'date', 'number', 'currency'
}