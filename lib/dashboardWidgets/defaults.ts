import type { DashboardWidget, DashboardWidgetType, WidgetLayout } from "./types";

export const WIDGET_TYPE_META: Record<DashboardWidgetType, { label: string; icon: string }> = {
  heading: { label: 'Heading', icon: 'Heading1' },
  text: { label: 'Text', icon: 'AlignLeft' },
  filter_bar: { label: 'Filter bar', icon: 'Filter' },
  quick_add_form: { label: 'Quick-add form', icon: 'Plus' },
  grid: { label: 'Data grid', icon: 'Table2' },
  summary_tile: { label: 'Summary tile', icon: 'Hash' },
  chart: { label: 'Activity chart', icon: 'BarChart2' },
  trust_reconciliation: { label: 'Trust reconciliation', icon: 'Landmark' },
  ledes_export: { label: 'LEDES export', icon: 'FileDown' },
};

// Sensible default size (grid units) for a freshly-added widget of each type;
// x/y are assigned by createWidget based on what's already on the canvas.
export const DEFAULT_LAYOUT_BY_TYPE: Record<DashboardWidgetType, Omit<WidgetLayout, 'x' | 'y'>> = {
  heading: { w: 12, h: 1 },
  text: { w: 12, h: 2 },
  filter_bar: { w: 12, h: 2 },
  quick_add_form: { w: 12, h: 2 },
  grid: { w: 12, h: 6 },
  summary_tile: { w: 3, h: 2 }, // 4 fit per 12-col row
  chart: { w: 12, h: 4 },
  trust_reconciliation: { w: 12, h: 10 },
  ledes_export: { w: 12, h: 6 },
};

export function createWidget(type: DashboardWidgetType, existingWidgets: DashboardWidget[]): DashboardWidget {
  const y = existingWidgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
  const layout: WidgetLayout = { x: 0, y, ...DEFAULT_LAYOUT_BY_TYPE[type] };
  const base = { id: crypto.randomUUID(), layout };
  switch (type) {
    case 'heading': return { ...base, type, config: { text: '', level: 2 } };
    case 'text': return { ...base, type, config: { text: '' } };
    case 'filter_bar': return { ...base, type, config: { fieldIds: [] } };
    case 'quick_add_form': return { ...base, type, config: { fieldIds: [] } };
    case 'grid': return { ...base, type, config: { fieldIds: [] } };
    case 'summary_tile': return { ...base, type, config: { label: '', fieldId: null, aggregate: 'sum', conditions: [] } };
    case 'chart': return { ...base, type, config: { dateFieldId: '', valueFieldId: null, aggregate: 'sum', granularity: 'day', series: [] } };
    case 'trust_reconciliation': return { ...base, type, config: {} };
    case 'ledes_export': return { ...base, type, config: {} };
  }
}
