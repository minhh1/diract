import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { APP_URL } from '@/lib/config';
import { computeChartSeries, computeSummaryTileValue, filterByConditions } from '@/lib/dashboardWidgets/compute';
import type { DashboardWidget } from '@/lib/dashboardWidgets/types';
import type { CustomTableField, CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';
import type { RecordField, SystemTableName } from '@/lib/records';
import { DashboardActivityChart } from './DashboardActivityChart';
import { QuickAddFormWidget } from './QuickAddFormWidget';

// Native port of components/dashboard/DashboardWidgetRenderer.tsx -- only
// renders the subset actually reachable from mobile/src/app/(app)/dashboards/
// today (heading, text, summary_tile, grid, chart, quick_add_form),
// matching the widget coverage described in mobile/README.md's dashboards
// section. Every other DashboardWidget type (the trust-accounting reports,
// document export/import, the public-page shortcuts, filter bars, ...)
// renders as an "open on web" fallback card instead of a blank gap or a
// crash -- a dashboard mixing supported and unsupported widgets still
// mostly works natively, one widget at a time, rather than being
// all-or-nothing.
function formatTileValue(value: number, fieldType: string): string {
  if (fieldType === 'currency') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCellValue(value: unknown, field: CustomTableField | undefined): string {
  if (value == null || value === '') return '-';
  if (field?.field_type === 'boolean') return value ? 'Yes' : 'No';
  if (field?.field_type === 'date') return new Date(String(value)).toLocaleDateString('en-AU');
  if (field?.field_type === 'currency') return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Relation fields hold a linked record's id here, not a resolved label --
  // resolving one per cell would mean one query per row per relation
  // column, which doesn't scale to a grid of any real size. Known v1 gap;
  // "Open on web" is a real fallback for anyone who needs the resolved
  // label right now, not just a note for later.
  if (field && ['entity', 'project', 'property', 'table_relation'].includes(field.field_type)) return '(linked record)';
  return String(value);
}

function OpenOnWebFallback({ label, path }: { label: string; path: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}${path}`)}
      style={[styles.fallback, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}
    >
      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 }}>{label}</Text>
      <ExternalLink size={14} color={theme.textSecondary} />
    </Pressable>
  );
}

export function DashboardWidgetRenderer({
  widget,
  records,
  fieldById,
  dashboardSlug,
  tableName,
  companyId,
  rawFields,
  onRecordAdded,
}: {
  widget: DashboardWidget;
  records: CustomTableRecord[];
  fieldById: Map<string, CustomTableField>;
  dashboardSlug: string;
  // Only set when the dashboard's source table is one of the 3 supported
  // system tables (see companyDashboards.ts) -- quick_add_form needs these
  // to actually create a record; anything else falls back to "open on web"
  // exactly like an unsupported widget type would.
  tableName: SystemTableName | null;
  companyId: string | null;
  rawFields: RecordField[];
  onRecordAdded?: () => void;
}) {
  const theme = useTheme();

  switch (widget.type) {
    case 'heading': {
      const size = widget.config.level === 1 ? 20 : widget.config.level === 2 ? 17 : 15;
      return <Text style={{ color: theme.text, fontWeight: '800', fontSize: size, marginTop: 4 }}>{widget.config.text || 'Heading'}</Text>;
    }

    case 'text':
      return <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>{widget.config.text}</Text>;

    case 'summary_tile': {
      const { value, fieldType } = computeSummaryTileValue(widget.config, records, fieldById);
      return (
        <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>{widget.config.label}</Text>
          <Text style={[styles.tileValue, { color: theme.text }]}>{formatTileValue(value, fieldType)}</Text>
        </View>
      );
    }

    case 'grid': {
      const columns = widget.config.fieldIds.map((id) => fieldById.get(id)).filter((f): f is CustomTableField => !!f);
      const rows = filterByConditions(records, widget.config.conditions, fieldById);
      if (columns.length === 0) return <Text style={{ color: theme.textSecondary, fontSize: 12 }}>This grid has no columns configured.</Text>;
      // Fixed per-column width (config.columnWidths, else DashboardGrid's
      // web default of 140px) applied identically to the header AND every
      // row -- each cell used to size itself off its own text content, so
      // a longer value in one row (e.g. "Acme Corp Merger" vs "Estate of
      // Doe") pushed that row's later columns out of line with every other
      // row's, found live comparing two rows' cell bounds side by side.
      const columnWidth = (f: CustomTableField) => widget.config.columnWidths?.[f.id] ?? 140;
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator style={[styles.gridBorder, { borderColor: theme.border }]}>
          <View>
            <View style={[styles.gridRow, styles.gridHeaderRow, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
              {columns.map((f) => (
                <Text key={f.id} numberOfLines={1} style={[styles.gridCell, styles.gridHeaderCell, { width: columnWidth(f), color: theme.textSecondary }]}>
                  {f.label}
                </Text>
              ))}
            </View>
            {rows.map((r) => (
              <View key={r.id} style={[styles.gridRow, { borderColor: theme.border }]}>
                {columns.map((f) => (
                  <Text key={f.id} numberOfLines={1} style={[styles.gridCell, { width: columnWidth(f), color: theme.text }]}>
                    {formatCellValue(r.values[f.field_key], f)}
                  </Text>
                ))}
              </View>
            ))}
            {rows.length === 0 && (
              <View style={styles.gridRow}>
                <Text style={{ color: theme.textSecondary, fontSize: 12, padding: 12 }}>No records.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      );
    }

    case 'chart': {
      const series = computeChartSeries(widget.config, records, fieldById);
      return <DashboardActivityChart series={series} granularity={widget.config.granularity ?? 'day'} chartType={widget.config.chartType} />;
    }

    case 'quick_add_form': {
      if (!tableName || !companyId) return <OpenOnWebFallback label="This widget only renders on the web dashboard" path={`/dashboard/boards/${dashboardSlug}`} />;
      return (
        <QuickAddFormWidget
          tableName={tableName}
          companyId={companyId}
          allFields={rawFields}
          fieldIds={widget.config.fieldIds}
          onAdded={() => onRecordAdded?.()}
        />
      );
    }

    default:
      return <OpenOnWebFallback label="This widget only renders on the web dashboard" path={`/dashboard/boards/${dashboardSlug}`} />;
  }
}

const styles = StyleSheet.create({
  fallback: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  tile: { padding: 14, borderRadius: 16, borderWidth: 1, minWidth: 140 },
  tileLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  tileValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  gridBorder: { borderWidth: 1, borderRadius: 12 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1 },
  gridHeaderRow: { borderBottomWidth: 1 },
  gridCell: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  gridHeaderCell: { fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
});
