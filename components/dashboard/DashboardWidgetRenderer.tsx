"use client";

// The one place widget -> presentational component dispatch happens. Used
// by both the view page (app/dashboard/[slug]/page.tsx, via
// StaticWidgetGrid) and the builder's Canvas editor (via react-grid-layout)
// and Code editor's preview pane -- so view-mode and every builder preview
// share one rendering code path.
import dynamic from "next/dynamic";
import DashboardFilterBar from "./DashboardFilterBar";
import DashboardQuickAddForm from "./DashboardQuickAddForm";
import DashboardGrid from "./DashboardGrid";
import { SummaryTile } from "./DashboardSummaryTiles";
import DashboardActivityChart from "./DashboardActivityChart";
// Every dashboard imports this ONE renderer regardless of which widget
// types it actually uses (see the switch below) -- filter_bar/quick_add_
// form/grid/summary_tile/chart stay static imports since nearly every
// dashboard in this app uses at least one of them, but the rest here are
// genuinely niche (trust accounting, a public-link share card, task
// conversion) and were costing every OTHER dashboard their bytes for
// nothing. Confirmed via a production build's client-reference-manifest:
// /dashboard/[tableSlug] (dashboards + custom tables, the single
// most-visited route in the app) referenced 1708.7KB across 15 chunks
// with these all statically imported.
const TrustReconciliationWidget = dynamic(() => import("./TrustReconciliationWidget"));
const LedesExportWidget = dynamic(() => import("./LedesExportWidget"));
const TrustLedgerStatementWidget = dynamic(() => import("./TrustLedgerStatementWidget"));
const TrustCashBookWidget = dynamic(() => import("./TrustCashBookWidget"));
const TrustAgedBalancesWidget = dynamic(() => import("./TrustAgedBalancesWidget"));
const PublicTaskPageWidget = dynamic(() => import("./PublicTaskPageWidget"));
const DocumentPublicPageWidget = dynamic(() => import("./DocumentPublicPageWidget"));
const ClientUpdatePageWidget = dynamic(() => import("./ClientUpdatePageWidget"));
const MyTasksButtonWidget = dynamic(() => import("./MyTasksButtonWidget"));
import { computeSummaryTileValue, computeChartSeries, filterByConditions } from "@/lib/dashboardWidgets/compute";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import type { DashboardSourceKind } from "@/lib/hooks/useDashboardData";

interface Props {
  widget: DashboardWidget;
  // 'custom' writes through lib/services/customTableService.ts (company_tables);
  // a system table name writes through lib/services/systemTableRecordService.ts
  // (native columns + company_custom_field_values) -- see
  // DashboardQuickAddForm.tsx/DashboardGrid.tsx, the two places this actually
  // matters (both otherwise treat tableId as opaque).
  sourceKind: DashboardSourceKind;
  fields: CustomTableField[];
  fieldById: Map<string, CustomTableField>;
  records: CustomTableRecord[]; // already filtered by the active filter bar
  // True while `records` hasn't landed yet even though the rest of the
  // dashboard (this renderer's own widgets) is already showing -- see
  // useCustomTable.ts's fields-first split. Passed straight through to the
  // grid widget's own loading-vs-empty distinction; undefined (falsy) in
  // builder-preview contexts, which never populate real records anyway.
  recordsLoading?: boolean;
  // Filtered by every active filter EXCEPT date fields -- a chart plotting
  // activity over time is meaningless once narrowed to one specific date
  // (the filter bar's own default), so it always shows every date while
  // still respecting e.g. a Staff filter. Falls back to `records` when a
  // caller hasn't threaded it through (builder preview contexts, where the
  // distinction doesn't matter -- there's no real filter bar interaction).
  chartRecords?: CustomTableRecord[];
  // Unfiltered -- trust_reconciliation/ledes_export ignore the dashboard's
  // ad-hoc filter bar (a matter filter narrowing the grid must not also
  // narrow a statutory reconciliation or an invoice export list).
  allRecords: CustomTableRecord[];
  tableId: string;
  companyId: string;
  userId: string;
  filters: Record<string, any>;
  setFilter: (fieldId: string, value: any) => void;
  onChanged: () => void;
  // Lets quick_add_form insert its new record into local state directly
  // instead of falling back to onChanged's full refetch -- see
  // useCustomTable.ts's addRecordOptimistic. Optional/undefined in
  // contexts that don't have it wired up (builder preview, any quick-add
  // form not yet updated to use it), where it just falls back to onChanged.
  onOptimisticAdd?: (id: string, values: Record<string, any>) => void;
  // 'preview' is used by the Code editor's live preview pane, where the
  // dashboard being previewed may not be saved yet -- interactive bits
  // (adding a record, editing a cell) are disabled rather than wired to a
  // real tableId/companyId that might not correspond to what's on screen.
  mode?: 'view' | 'preview';
  // Source table is an append-only ledger (company_tables.is_ledger) --
  // grids render read-only; entries are only added via the quick-add form.
  isLedger?: boolean;
  // Gates the grid widget's column reorder/resize handles (see
  // DashboardGrid's isAdmin) -- omitted (undefined) in builder-preview
  // contexts on purpose, same as onWidgetChange below, so the only place
  // this ever shows is the live view page.
  isAdmin?: boolean;
  // Persists a change to THIS widget's own config (column reorder/resize
  // today) back to company_dashboards.widgets -- see useDashboardData's
  // updateWidget. Left undefined in builder-preview contexts, where the
  // widget's own config panel (gear icon) is the one place to edit it
  // instead of live drag interactions on a preview that isn't the real thing.
  onWidgetChange?: (updated: DashboardWidget) => void;
  // Extra field_key -> value pairs merged into every record created via the
  // quick_add_form/grid widgets below -- see DashboardQuickAddForm's doc
  // comment. Undefined everywhere except record-scoped dashboard tabs.
  fixedValues?: Record<string, any>;
  // A field_key -> value map waiting to be picked up by THIS dashboard's
  // quick_add_form widget -- see useDashboardData's quickAddPrefill doc
  // comment. Undefined in builder-preview contexts (no live quick-add form
  // there to receive it anyway).
  quickAddPrefill?: Record<string, any> | null;
  // Sets/clears quickAddPrefill -- called by my_tasks_button's "Convert" to
  // hand values off, and by quick_add_form itself once it's applied them.
  onQuickAddPrefill?: (values: Record<string, any> | null) => void;
}

export default function DashboardWidgetRenderer({
  widget, sourceKind, fields, fieldById, records, recordsLoading, chartRecords, allRecords, tableId, companyId, userId, filters, setFilter, onChanged, mode = 'view', isLedger,
  isAdmin, onWidgetChange, fixedValues, quickAddPrefill, onQuickAddPrefill, onOptimisticAdd,
}: Props) {
  switch (widget.type) {
    case 'heading': {
      const Tag = (`h${widget.config.level}` as unknown) as 'h1' | 'h2' | 'h3';
      const sizeClass = widget.config.level === 1 ? 'text-xl' : widget.config.level === 2 ? 'text-base' : 'text-sm';
      return <Tag className={`${sizeClass} font-bold text-slate-900`}>{widget.config.text || 'Heading'}</Tag>;
    }

    case 'text':
      return <p className="text-[13px] text-slate-600 whitespace-pre-wrap">{widget.config.text}</p>;

    case 'filter_bar':
      return (
        <DashboardFilterBar
          fields={fields}
          filterFieldIds={widget.config.fieldIds}
          filters={filters}
          onFilterChange={setFilter}
          pillSize={widget.config.pillSize}
          pillGap={widget.config.pillGap}
          fieldLayout={widget.config.fieldLayout}
          isAdmin={mode === 'view' ? isAdmin : undefined}
          onReorder={onWidgetChange ? (fieldIds) => onWidgetChange({ ...widget, config: { ...widget.config, fieldIds } }) : undefined}
        />
      );

    case 'quick_add_form':
      if (mode === 'preview') {
        return <div className="p-4 bg-white border border-dashed border-slate-200 rounded-2xl text-[11px] text-slate-300 italic">Quick-add form preview (disabled while editing)</div>;
      }
      return (
        <DashboardQuickAddForm
          tableId={tableId}
          sourceKind={sourceKind}
          companyId={companyId}
          userId={userId}
          fields={fields}
          quickAddFieldIds={widget.config.fieldIds}
          onAdded={onChanged}
          onOptimisticAdd={onOptimisticAdd}
          fixedValues={fixedValues}
          pillSize={widget.config.pillSize}
          pillGap={widget.config.pillGap}
          fieldLayout={widget.config.fieldLayout}
          isAdmin={mode === 'view' ? isAdmin : undefined}
          onReorder={onWidgetChange ? (fieldIds) => onWidgetChange({ ...widget, config: { ...widget.config, fieldIds } }) : undefined}
          prefill={quickAddPrefill}
          onPrefillApplied={onQuickAddPrefill ? () => onQuickAddPrefill(null) : undefined}
        />
      );

    case 'grid':
      return (
        <DashboardGrid
          tableId={tableId}
          sourceKind={sourceKind}
          companyId={companyId}
          userId={userId}
          fields={fields}
          gridFieldIds={widget.config.fieldIds}
          records={filterByConditions(records, widget.config.conditions, fieldById)}
          recordsLoading={recordsLoading}
          onChanged={mode === 'preview' ? () => {} : onChanged}
          readOnly={isLedger}
          emptyRowCount={mode === 'preview' ? 0 : (widget.config.emptyRowCount || 0)}
          columnWidths={widget.config.columnWidths}
          columnHighlights={widget.config.columnHighlights}
          showTotalsRow={widget.config.showTotalsRow}
          fieldById={fieldById}
          isAdmin={mode === 'view' ? isAdmin : undefined}
          onReorder={onWidgetChange ? (fieldIds) => onWidgetChange({ ...widget, config: { ...widget.config, fieldIds } }) : undefined}
          onResize={onWidgetChange ? (fieldId, width) => onWidgetChange({
            ...widget,
            config: { ...widget.config, columnWidths: { ...(widget.config.columnWidths || {}), [fieldId]: width } },
          }) : undefined}
        />
      );

    case 'summary_tile': {
      const { value, fieldType } = computeSummaryTileValue(widget.config, records, fieldById);
      return <SummaryTile label={widget.config.label} value={value} fieldType={fieldType} />;
    }

    case 'chart': {
      const series = computeChartSeries(widget.config, chartRecords ?? records, fieldById);
      const dateFieldId = widget.config.dateFieldId;
      const selectedBucket = dateFieldId ? (filters[dateFieldId] ?? null) : null;
      return (
        <DashboardActivityChart
          series={series}
          granularity={widget.config.granularity ?? 'day'}
          chartType={widget.config.chartType}
          selectedBucket={selectedBucket}
          // Clicking the already-selected bucket clears it (toggle) instead
          // of re-setting the same value -- lets the viewer get back to
          // "every date" without hunting for the filter bar's own clear
          // control. Disabled in preview (mode !== 'view'), same as every
          // other interactive bit in this switch.
          onBucketClick={mode === 'view' && dateFieldId
            ? (bucket) => setFilter(dateFieldId, bucket === selectedBucket ? '' : bucket)
            : undefined}
        />
      );
    }

    case 'trust_reconciliation':
      return <TrustReconciliationWidget records={allRecords} />;

    case 'ledes_export':
      return <LedesExportWidget records={allRecords} />;

    case 'trust_ledger_statement':
      return <TrustLedgerStatementWidget records={allRecords} />;

    case 'trust_cash_book':
      return <TrustCashBookWidget records={allRecords} />;

    case 'trust_aged_balances':
      return <TrustAgedBalancesWidget records={allRecords} dormantDays={widget.config.dormantDays} />;

    case 'public_task_page':
      return <PublicTaskPageWidget pageId={widget.config.pageId} />;

    case 'public_document_page':
      return <DocumentPublicPageWidget pageId={widget.config.pageId} />;

    case 'public_client_update_page':
      return <ClientUpdatePageWidget slug={widget.config.slug} />;

    case 'my_tasks_button': {
      if (mode === 'preview') {
        return (
          <div className="w-full h-full min-h-[56px] flex items-center justify-center px-4 py-3 bg-white border border-dashed border-slate-200 rounded-2xl text-[11px] text-slate-300 italic text-center">
            My Tasks button preview (disabled while editing)
          </div>
        );
      }
      const descriptionField = widget.config.descriptionFieldId ? fieldById.get(widget.config.descriptionFieldId) : undefined;
      const matterField = widget.config.matterFieldId ? fieldById.get(widget.config.matterFieldId) : undefined;
      return (
        <MyTasksButtonWidget
          label={widget.config.label || 'My Tasks'}
          companyId={companyId}
          userId={userId}
          descriptionFieldKey={descriptionField?.field_key ?? null}
          matterFieldKey={matterField?.field_key ?? null}
          onConvert={values => onQuickAddPrefill?.(values)}
        />
      );
    }

    default:
      return null;
  }
}
