import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { openOnWeb } from '@/lib/webHandoff';
import { computeSummaryTileValue, filterByConditions } from '@/lib/dashboardWidgets/compute';
import { DashboardFilterBar, matchesFilterValue } from './DashboardFilterBar';
import type { DashboardWidget } from '@/lib/dashboardWidgets/types';
import type { CustomTableField, CustomTableRecord } from '@/lib/dashboardWidgets/customTableTypes';
import type { RecordField, SystemTableName } from '@/lib/records';
import { formatCurrency, formatNumber } from '@/lib/format';
import { ChartWidgetContainer } from './DashboardActivityChart';
import { QuickAddFormWidget } from './QuickAddFormWidget';
import { CustomTableQuickAddForm } from './CustomTableQuickAddForm';
import { MyTasksButtonWidget } from './MyTasksButtonWidget';
import { AutoTimeRecordingButtonWidget } from './AutoTimeRecordingButtonWidget';
import { PublicTaskPageLinkWidget, PublicDocumentPageLinkWidget, PublicClientUpdatePageLinkWidget } from './PublicPageLinkWidgets';
import { TimeFeesReportWidget } from './TimeFeesReportWidget';
import { TimeAgingReportWidget } from './TimeAgingReportWidget';
import { TrustReconciliationWidget } from './TrustReconciliationWidget';
import { TrustLedgerStatementWidget } from './TrustLedgerStatementWidget';
import { TrustCashBookWidget } from './TrustCashBookWidget';
import { TrustAgedBalancesWidget } from './TrustAgedBalancesWidget';
import { LedesExportWidget } from './LedesExportWidget';
import { DocumentExportWidget } from './DocumentExportWidget';
import { InvoiceImportWidget } from './InvoiceImportWidget';

// Mirrors lib/hooks/useDashboardData.ts's own activeFilters -- empty/null
// filter values (never set, or explicitly cleared back to "All") don't
// narrow anything.
function activeFilterEntries(filters: Record<string, any>): [string, any][] {
  return Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== '');
}

function applyFilters(records: CustomTableRecord[], filters: Record<string, any>, fieldById: Map<string, CustomTableField>): CustomTableRecord[] {
  const active = activeFilterEntries(filters);
  if (active.length === 0) return records;
  return records.filter((r) => active.every(([fieldId, val]) => {
    const field = fieldById.get(fieldId);
    if (!field) return true;
    return matchesFilterValue(field.field_type, r.values[field.field_key], val);
  }));
}

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
  return fieldType === 'currency' ? formatCurrency(value) : formatNumber(value);
}

const RELATION_FIELD_TYPES = new Set(['entity', 'project', 'property', 'table_relation']);

// Same tableName -> native screen mapping RecordListView's basePath prop
// already uses per-tab (mobile/src/app/(app)/{matters,tasks,leads}/index.tsx).
// A dashboard's grid widget used to render each row as plain <Text> with no
// way to open the record at all -- the only way in was leaving the
// dashboard and re-finding it on its own tab. Tapping a row now jumps
// straight to that record's real native screen (RecordDetailView, the same
// "natively made" screen its own tab pushes to, not a webview or the
// public/tasks page) for the 3 system tables that have one; a dashboard
// bound to a custom table has no native record screen yet, so those rows
// stay non-interactive rather than linking somewhere wrong.
const SYSTEM_TABLE_BASE_PATH: Partial<Record<SystemTableName, string>> = {
  projects: '/matters',
  tasks: '/tasks',
  entities: '/leads',
  properties: '/more/properties',
};

function formatCellValue(value: unknown, field: CustomTableField | undefined, displayValue: string | undefined): string {
  if (field && RELATION_FIELD_TYPES.has(field.field_type)) {
    // Never show the raw linked-record id -- companyDashboards.ts/
    // customTableDashboardData.ts batch-resolve every relation column via
    // relationResolution.ts before this ever renders. A blank dash here
    // means either no link is set, or (briefly, on first paint) the
    // resolution query hasn't settled yet -- not a broken link.
    return value == null || value === '' ? '-' : displayValue ?? '…';
  }
  if (value == null || value === '') return '-';
  if (field?.field_type === 'boolean') return value ? 'Yes' : 'No';
  if (field?.field_type === 'date') return new Date(String(value)).toLocaleDateString('en-AU');
  if (field?.field_type === 'currency') return formatCurrency(value);
  return String(value);
}

function OpenOnWebFallback({ label, path }: { label: string; path: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => openOnWeb(path)}
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
  fields,
  fieldById,
  filters,
  onFilterChange,
  dashboardSlug,
  dashboardId,
  tableName,
  customTableId,
  companyId,
  userId,
  rawFields,
  onRecordAdded,
  quickAddPrefill,
  onQuickAddPrefill,
}: {
  widget: DashboardWidget;
  records: CustomTableRecord[];
  // Only needed by filter_bar (to resolve its configured fieldIds to
  // labels/types/options) -- every other case already gets what it needs
  // off fieldById.
  fields: CustomTableField[];
  fieldById: Map<string, CustomTableField>;
  filters: Record<string, any>;
  onFilterChange: (fieldId: string, value: any) => void;
  dashboardSlug: string;
  // company_dashboards.id -- only needed by document_export/invoice_import
  // (the API routes they hit are keyed by dashboard id, not slug).
  dashboardId: string | null;
  // Set when the dashboard's source table is one of the 3 supported system
  // tables (see companyDashboards.ts) -- quick_add_form writes through
  // lib/recordsWrite.ts when this is set, or customTableWrite.ts when
  // customTableId is set instead (never both).
  tableName: SystemTableName | null;
  customTableId: string | null;
  companyId: string | null;
  userId: string | null;
  rawFields: RecordField[];
  onRecordAdded?: () => void;
  // Set by my_tasks_button's "Convert", consumed by quick_add_form -- see
  // CustomTableQuickAddForm.tsx's prefill prop for the full explanation.
  quickAddPrefill?: Record<string, unknown> | null;
  onQuickAddPrefill?: (values: Record<string, unknown> | null) => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  switch (widget.type) {
    case 'heading': {
      const size = widget.config.level === 1 ? 20 : widget.config.level === 2 ? 17 : 15;
      return <Text style={{ color: theme.text, fontWeight: '800', fontSize: size, marginTop: 4 }}>{widget.config.text || 'Heading'}</Text>;
    }

    case 'text':
      return <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>{widget.config.text}</Text>;

    case 'filter_bar':
      return <DashboardFilterBar fields={fields} filterFieldIds={widget.config.fieldIds} filters={filters} onFilterChange={onFilterChange} />;

    case 'summary_tile': {
      const { value, fieldType } = computeSummaryTileValue(widget.config, applyFilters(records, filters, fieldById), fieldById);
      return (
        <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>{widget.config.label}</Text>
          <Text style={[styles.tileValue, { color: theme.text }]}>{formatTileValue(value, fieldType)}</Text>
        </View>
      );
    }

    case 'grid': {
      const columns = widget.config.fieldIds.map((id) => fieldById.get(id)).filter((f): f is CustomTableField => !!f);
      const rows = filterByConditions(applyFilters(records, filters, fieldById), widget.config.conditions, fieldById);
      if (columns.length === 0) return <Text style={{ color: theme.textSecondary, fontSize: 12 }}>This grid has no columns configured.</Text>;
      // Fixed per-column width (config.columnWidths, else DashboardGrid's
      // web default of 140px) applied identically to the header AND every
      // row -- each cell used to size itself off its own text content, so
      // a longer value in one row (e.g. "Acme Corp Merger" vs "Estate of
      // Doe") pushed that row's later columns out of line with every other
      // row's, found live comparing two rows' cell bounds side by side.
      const columnWidth = (f: CustomTableField) => widget.config.columnWidths?.[f.id] ?? 140;
      const basePath = tableName ? SYSTEM_TABLE_BASE_PATH[tableName] : undefined;
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
            {rows.map((r) => {
              const row = (
                <View style={[styles.gridRow, { borderColor: theme.border }]}>
                  {columns.map((f) => (
                    <Text key={f.id} numberOfLines={1} style={[styles.gridCell, { width: columnWidth(f), color: theme.text }]}>
                      {formatCellValue(r.values[f.field_key], f, r.displayValues?.[f.field_key])}
                    </Text>
                  ))}
                </View>
              );
              return basePath ? (
                <Pressable key={r.id} onPress={() => router.push(`${basePath}/${r.id}` as never)}>
                  {row}
                </Pressable>
              ) : (
                <View key={r.id}>{row}</View>
              );
            })}
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
      // A chart plotting activity over time is meaningless once narrowed to
      // the filter bar's own date value -- see web's chartRecords for the
      // same exclusion. Every other active filter (e.g. Staff) still
      // applies.
      const nonDateFilters = Object.fromEntries(activeFilterEntries(filters).filter(([fieldId]) => fieldById.get(fieldId)?.field_type !== 'date'));
      return (
        <ChartWidgetContainer
          config={widget.config}
          records={applyFilters(records, nonDateFilters, fieldById)}
          fieldById={fieldById}
          chartType={widget.config.chartType}
        />
      );
    }

    case 'quick_add_form': {
      if (tableName && companyId) {
        return (
          <QuickAddFormWidget
            tableName={tableName}
            companyId={companyId}
            allFields={rawFields}
            fieldIds={widget.config.fieldIds}
            onAdded={() => onRecordAdded?.()}
            prefill={quickAddPrefill}
            onPrefillApplied={onQuickAddPrefill ? () => onQuickAddPrefill(null) : undefined}
          />
        );
      }
      if (customTableId && companyId && userId) {
        return (
          <CustomTableQuickAddForm
            tableId={customTableId}
            companyId={companyId}
            userId={userId}
            allFields={fields}
            fieldIds={widget.config.fieldIds}
            dashboardSlug={dashboardSlug}
            onAdded={() => onRecordAdded?.()}
            prefill={quickAddPrefill}
            onPrefillApplied={onQuickAddPrefill ? () => onQuickAddPrefill(null) : undefined}
          />
        );
      }
      return <OpenOnWebFallback label="This widget only renders on the web dashboard" path={`/dashboard/boards/${dashboardSlug}`} />;
    }

    case 'my_tasks_button': {
      if (!companyId || !userId) return <OpenOnWebFallback label="This widget only renders on the web dashboard" path={`/dashboard/boards/${dashboardSlug}`} />;
      const descriptionField = widget.config.descriptionFieldId ? fieldById.get(widget.config.descriptionFieldId) : undefined;
      const matterField = widget.config.matterFieldId ? fieldById.get(widget.config.matterFieldId) : undefined;
      return (
        <MyTasksButtonWidget
          label={widget.config.label || 'My Tasks'}
          companyId={companyId}
          userId={userId}
          descriptionFieldKey={descriptionField?.field_key ?? null}
          matterFieldKey={matterField?.field_key ?? null}
          onConvert={(values) => onQuickAddPrefill?.(values)}
        />
      );
    }

    case 'auto_time_recording_button': {
      if (!companyId || !userId) return <OpenOnWebFallback label="This widget only renders on the web dashboard" path={`/dashboard/boards/${dashboardSlug}`} />;
      return <AutoTimeRecordingButtonWidget label={widget.config.label || 'Auto Time Recording'} companyId={companyId} userId={userId} />;
    }

    case 'public_task_page':
      return <PublicTaskPageLinkWidget pageId={widget.config.pageId} />;

    case 'public_document_page':
      return <PublicDocumentPageLinkWidget pageId={widget.config.pageId} />;

    case 'public_client_update_page':
      return <PublicClientUpdatePageLinkWidget slug={widget.config.slug} />;

    case 'time_fees_report':
      return <TimeFeesReportWidget records={records} />;

    case 'time_aging_report':
      return <TimeAgingReportWidget records={records} agingDays={widget.config.agingDays} />;

    case 'trust_reconciliation':
      return <TrustReconciliationWidget records={records} />;

    case 'ledes_export':
      return <LedesExportWidget records={records} />;

    case 'trust_ledger_statement':
      return <TrustLedgerStatementWidget records={records} />;

    case 'trust_cash_book':
      return <TrustCashBookWidget records={records} />;

    case 'trust_aged_balances':
      return <TrustAgedBalancesWidget records={records} dormantDays={widget.config.dormantDays} />;

    case 'document_export':
      return <DocumentExportWidget records={records} config={widget.config} dashboardId={dashboardId} widgetId={widget.id} />;

    case 'invoice_import':
      return <InvoiceImportWidget config={widget.config} dashboardId={dashboardId} widgetId={widget.id} onImported={() => onRecordAdded?.()} />;

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
