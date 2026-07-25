// Shared visual sizing for a widget's "pills" -- the search-and-choose bar/
// input controls in a filter bar or quick-add form (RelationPicker, date/
// select/text inputs).
//
// Two independent layers: pillSize/pillGap are WIDGET-level (every control
// in one filter_bar/quick_add_form widget scales together -- see
// lib/dashboardWidgets/types.ts's FilterBarWidget/QuickAddFormWidget
// config); fieldLayout's `width` is PER-FIELD (config.fieldLayout, keyed by
// field id), letting one pill run wider or narrower than its neighbors
// without changing anyone else's size. Position is handled separately, by
// the field's order within config.fieldIds itself (already reorderable via
// FieldPickerList) -- there's no separate position value here.
export type PillSize = 'sm' | 'md' | 'lg';
export type PillGap = 'tight' | 'normal' | 'loose';
export type FieldWidth = 'sm' | 'md' | 'lg' | 'full';

export const PILL_SIZE_CLASSES: Record<PillSize, string> = {
  sm: 'py-1.5 px-3 text-[12px]',
  md: 'py-2 px-3.5 text-[13px]',
  lg: 'py-2.5 px-4 text-[14px]',
};

export const PILL_GAP_CLASSES: Record<PillGap, string> = {
  tight: 'gap-1.5',
  normal: 'gap-3',
  loose: 'gap-5',
};

// Fixed widths, not flex-grow/shrink -- each pill keeps its own configured
// width regardless of how many neighbors it has, which is also what fixed
// the Date/Staff/Type pills visually overlapping (they were all
// `flex-1 min-w-[110px]`, fighting over shared space that a native date
// input's intrinsic minimum width could exceed once enough pills crowded
// one row).
export const FIELD_WIDTH_CLASSES: Record<FieldWidth, string> = {
  sm: 'w-28',
  md: 'w-48',
  lg: 'w-72',
  full: 'w-full',
};

export const PILL_SIZE_LABELS: Record<PillSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };
export const PILL_GAP_LABELS: Record<PillGap, string> = { tight: 'Tight', normal: 'Normal', loose: 'Loose' };
export const FIELD_WIDTH_LABELS: Record<FieldWidth, string> = { sm: 'Narrow', md: 'Medium', lg: 'Wide', full: 'Full row' };

// Sensible width when a field has no explicit override -- text fields read
// more comfortably wide, booleans (a checkbox + label) don't need to fill a
// fixed-width box at all, everything else gets a middle-ground default.
export function defaultFieldWidth(fieldType: string): FieldWidth {
  if (fieldType === 'text') return 'lg';
  if (fieldType === 'boolean') return 'sm';
  return 'md';
}
