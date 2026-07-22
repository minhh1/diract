// Runs (and persists) the legacy->widgets conversion exactly once per
// dashboard row. Deliberately does NOT call logSchemaChange -- this is a
// one-time infrastructure migration, not a user-authored edit, so it should
// not show up in the revertible schema history. Idempotent: a race between
// two tabs opening the same never-converted dashboard simultaneously both
// compute the same deterministic conversion and both write it -- last-write-
// wins, no corruption.
import { supabase } from "@/lib/supabase";
import type { DashboardWidget } from "./types";
import { convertLegacyToWidgets, type LegacyDashboardColumns } from "./legacyConvert";

export interface RawCompanyDashboardRow extends LegacyDashboardColumns {
  id: string;
  widgets: DashboardWidget[];
  widgets_migrated_at: string | null;
}

export async function ensureDashboardWidgetsMigrated(dashboard: RawCompanyDashboardRow): Promise<DashboardWidget[]> {
  if (dashboard.widgets_migrated_at) return dashboard.widgets || [];
  const widgets = convertLegacyToWidgets(dashboard);
  const now = new Date().toISOString();
  await supabase.from('company_dashboards')
    .update({ widgets, widgets_migrated_at: now })
    .eq('id', dashboard.id);
  return widgets;
}
