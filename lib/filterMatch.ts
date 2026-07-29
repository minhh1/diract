// lib/filterMatch.ts
// Shared ActiveFilter matching logic -- originally only lived inline in
// GenericMasterTable.tsx's sortedItems; pulled out here so
// CustomTableMasterPage.tsx's own filters (see that file) apply the exact
// same operator semantics rather than drifting from a hand-copied version.
import type { ActiveFilter } from "@/lib/types/filters";

export function matchesFilter(raw: any, filter: ActiveFilter): boolean {
  const itemVal = (raw === null || raw === undefined ? '' : String(raw)).toLowerCase().trim();
  const filterVal = filter.value.toLowerCase().trim();

  switch (filter.operator) {
    case 'equals':       return itemVal === filterVal;
    case 'not_equals':   return itemVal !== filterVal;
    case 'contains':     return itemVal.includes(filterVal);
    case 'not_contains': return !itemVal.includes(filterVal);
    case 'starts_with':  return itemVal.startsWith(filterVal);
    case 'is_empty':     return itemVal === '';
    case 'is_not_empty': return itemVal !== '';
    case 'is_true':      return raw === true || itemVal === 'true' || itemVal === 'yes';
    case 'is_false':     return raw === false || itemVal === 'false' || itemVal === 'no';
    case 'gt':           return Number(raw) > Number(filter.value);
    case 'gte':          return Number(raw) >= Number(filter.value);
    case 'lt':           return Number(raw) < Number(filter.value);
    case 'lte':          return Number(raw) <= Number(filter.value);
    default:              return true;
  }
}

// getRaw resolves an ActiveFilter's fieldId to the record's raw value for
// that field -- differs per caller (GenericMasterTable.tsx distinguishes a
// `custom_field:`-prefixed id from a plain column; CustomTableMasterPage.tsx
// maps a field id to its field_key in a values bag), so it stays a callback
// rather than this function assuming a particular record shape.
export function matchesAllFilters(filters: ActiveFilter[], getRaw: (fieldId: string) => any): boolean {
  return filters.every(f => matchesFilter(getRaw(f.fieldId), f));
}
