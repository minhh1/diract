// One-time conversion of a pre-widgets company_dashboards row's five legacy
// columns into an equivalent DashboardWidget[]. Deterministic and pure --
// safe to call more than once (idempotent output for the same input), but
// callers should only invoke it when widgets_migrated_at is null (see
// ensureMigrated.ts) so a user's later, deliberate edits in the new builder
// are never overwritten.
import type { DashboardWidget } from "./types";
import type { SummaryTileConfig, ChartConfig } from "@/lib/hooks/useDashboardData";

export interface LegacyDashboardColumns {
  filter_field_ids: string[];
  quick_add_field_ids: string[];
  grid_field_ids: string[];
  summary_tiles: SummaryTileConfig[];
  chart_config: ChartConfig | null;
}

export function convertLegacyToWidgets(dashboard: LegacyDashboardColumns): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  let y = 0;
  const add = (w: Omit<DashboardWidget, 'id'>) => {
    widgets.push({ id: crypto.randomUUID(), ...w } as DashboardWidget);
  };

  if (dashboard.filter_field_ids?.length) {
    add({ type: 'filter_bar', config: { fieldIds: dashboard.filter_field_ids }, layout: { x: 0, y, w: 12, h: 2 } });
    y += 2;
  }
  if (dashboard.quick_add_field_ids?.length) {
    add({ type: 'quick_add_form', config: { fieldIds: dashboard.quick_add_field_ids }, layout: { x: 0, y, w: 12, h: 2 } });
    y += 2;
  }
  if (dashboard.grid_field_ids?.length) {
    add({ type: 'grid', config: { fieldIds: dashboard.grid_field_ids }, layout: { x: 0, y, w: 12, h: 6 } });
    y += 6;
  }
  // Tiles packed 4-across, matching DashboardSummaryTiles' existing grid-cols-4.
  (dashboard.summary_tiles || []).forEach((tile, i) => {
    add({
      type: 'summary_tile',
      config: { ...tile },
      layout: { x: (i % 4) * 3, y: y + Math.floor(i / 4) * 2, w: 3, h: 2 },
    });
  });
  if (dashboard.summary_tiles?.length) y += Math.ceil(dashboard.summary_tiles.length / 4) * 2;
  if (dashboard.chart_config) {
    add({
      type: 'chart',
      config: { ...dashboard.chart_config },
      layout: { x: 0, y, w: 12, h: 4 },
    });
  }
  return widgets;
}
