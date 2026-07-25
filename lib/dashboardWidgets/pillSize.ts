// Shared visual sizing for a widget's "pills" -- the search-and-choose bar/
// input controls in a filter bar or quick-add form (RelationPicker, date/
// select/text inputs). Widget-level (FilterBarWidget/QuickAddFormWidget
// config.pillSize/pillGap in lib/dashboardWidgets/types.ts), not per-field --
// every control in one widget scales together, consistently, rather than a
// user having to size each field individually.
export type PillSize = 'sm' | 'md' | 'lg';
export type PillGap = 'tight' | 'normal' | 'loose';

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

export const PILL_SIZE_LABELS: Record<PillSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };
export const PILL_GAP_LABELS: Record<PillGap, string> = { tight: 'Tight', normal: 'Normal', loose: 'Loose' };
