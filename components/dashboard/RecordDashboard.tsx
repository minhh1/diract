// components/dashboard/RecordDashboard.tsx
"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle, Trash2,
  Pencil, FolderKanban, Plus, X, ShieldCheck, Check,
  Columns2, Rows2, Maximize2, Minimize2,
  LayoutGrid, MapPin, Building2, CheckSquare, Table2,
} from "lucide-react";
import ProjectAccessPanel from "@/components/projects/ProjectAccessPanel";
import ProjectDeletedTasksPanel from "@/components/projects/ProjectDeletedTasksPanel";
import TabBar, { type RecordTab } from "./TabBar";
import AddTabModal from "./AddTabModal";
import { DEFAULT_PROJECT_DASHBOARD_TAB_SPECS, buildDefaultTabWidgetsForSpec } from "@/lib/dashboardWidgets/defaultRecordDashboardTabs";
import { TRUST_PAGE_MANAGED_SLUGS } from "@/components/Sidebar";
import FieldLayoutEditor, { type FieldLayout } from "./FieldLayoutEditor";
import type { AutoNumberConfigValue } from "@/lib/schema/autoNumberPresets";
import SubProjectsTab from "./tabs/SubProjectsTab";
import RelatedMattersTab from "./tabs/RelatedMattersTab";
import ChecklistTab from "./tabs/ChecklistTab";
import CalendarTab from "./tabs/CalendarTab";
import EmailsTab from "./tabs/EmailsTab";
import DocumentTemplatesTab from "./tabs/DocumentTemplatesTab";
import PrecedentsTab from "./tabs/PrecedentsTab";
import RecordDashboardTab from "./tabs/RecordDashboardTab";
import InvoicesTab from "./tabs/InvoicesTab";
import FinanceModelTab from "./tabs/FinanceModelTab";
import TrustAccountTab from "./tabs/TrustAccountTab";
import ResidualLandSolverTab from "./tabs/ResidualLandSolverTab";
import SendSmsCard from "./SendSmsCard";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { fetchCompanyCustomFields } from "@/lib/hooks/useCompanyCustomFields";
import {
  SYSTEM_TABLE_HIDDEN_COLS, SYSTEM_TABLE_RELATION_MAP, SYSTEM_TABLE_PERSON_LINK_COLS,
} from "@/lib/schema/systemTableRelations";
import { ENTITY_TYPES } from "@/lib/entityTypes";
import { invalidateEntityRelationCache } from "./RelationPicker";
const TRUSTEE_ROLE_TYPES = ["Corporate Trustee", "Non Corporate Trustee"];
import { buildMissingDefaultProjectDashboardTabs, buildMissingDefaultTabsFromCompanyDefaults } from "@/lib/dashboardWidgets/defaultRecordDashboardTabs";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";
import { getSchemaMetadata } from "@/lib/services/schemaService";
import { createArchiveRequest, type ArchiveEntityTable } from "@/lib/archiveRequests";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { useCompany } from "@/components/CompanyContext";
import { perfLog, perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";

// ── Types ──────────────────────────────────────────────────────────

interface Props {
  systemTable?: 'properties' | 'entities' | 'projects' | 'tasks';
  tableId?: string;
  tableSlug?: string;
  tableName?: string;
  recordId: string;
  onBack: () => void;
  embedded?: boolean;
  initialRecord?: any; // pre-fetched row from master table — skips first loadRecord fetch
}

// Guards resolveLinkedItems' relation lookup below against a value_text-only
// custom field value that was never actually linked to a real record (see
// that comment for how NewProjectModal.tsx's plain-text entity input
// produces exactly this).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Main component ─────────────────────────────────────────────────

export default function RecordDashboard({
  systemTable, tableId, tableName,
  recordId, onBack, embedded = false, initialRecord,
}: Props) {
  const { companyId: ctxCompanyId, userId: ctxUserId, isAdmin: ctxIsAdmin } = useCompany();
  // Passing userId matters here, not just for private-table filtering --
  // without it useCustomTables() can't seed its cache synchronously and has
  // to resolve auth.getUser() first, so `customTables` is still `[]` at the
  // moment loadTabs() below runs on a fast page load. buildMissingDefault-
  // ProjectDashboardTabs then silently can't find e.g. the "Time & Fee
  // Entries" table and skips seeding this Matter's built-in Time & Fees/
  // Disbursements/Invoices tabs -- permanently, since once any OTHER tab
  // (e.g. a manually-added one) claims that same linked_table_id, the
  // idempotent top-up on every later load treats it as already covered.
  const { tables: customTables } = useCustomTables(ctxUserId);

  const [record, setRecord] = useState<Record<string, any> | null>(initialRecord ?? null);
  const [fields, setFields] = useState<FieldLayout[]>([]);
  const [tabs, setTabs] = useState<RecordTab[]>([]);
  // Distinguishes "still loading" from "genuinely has no tabs" -- tabs
  // starts empty on every load (it isn't part of initialRecord), so without
  // this the empty-state "No tabs yet / Add first tab" prompt flashes for
  // the brief window between an instant render (see hasMatchingInitialData
  // in loadAll) and record_tabs actually resolving.
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Deep link from the precedent library ("Use on a matter"). Read once on
  // mount rather than via useSearchParams so it doesn't re-fire and re-open
  // the issue modal after the user closes it.
  const [initialPrecedentId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('precedent')
  );
  // Deep link from a matter reference elsewhere (e.g. a trust ledger row's
  // "Matter" cell) straight onto a specific tab_type -- ?tab=trust_account
  // etc. Same read-once-on-mount shape as initialPrecedentId above, and the
  // same reason: a plain query param, not useSearchParams, so it doesn't
  // re-fire on every render.
  const [initialTabType] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab')
  );
  const [tabFieldLayouts, setTabFieldLayouts] = useState<Record<string, FieldLayout[]>>({});
  const [loading, setLoading] = useState(!initialRecord); // skip spinner if we have initial data
  const [isEditingTabs, setIsEditingTabs] = useState(false);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [showAddTab, setShowAddTab] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [subProjects, setSubProjects] = useState<any[]>([]);
  const [activeSubProjectId, setActiveSubProjectId] = useState<string | null>(null);
  // "Add sub-project" opens this draft instead of inserting immediately --
  // nothing hits the database until the user explicitly saves it.
  const [isAddingSubProject, setIsAddingSubProject] = useState(false);
  const [newSubProjectName, setNewSubProjectName] = useState('');
  const [parentRecord, setParentRecord] = useState<any | null>(null);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [fieldPickerTabId, setFieldPickerTabId] = useState<string | null>(null);
  // Sub-project split panel -- 'stack' shares the screen top/bottom (a
  // horizontal divider), 'side' shares it left/right (a vertical divider).
  // `subProjectRatio` is the sub-project pane's fraction of the shared
  // space (not pixels) so it stays sane across orientation switches and
  // window resizes. Fullscreen is a separate flag layered on top rather
  // than a third ratio value, so toggling it back off restores exactly the
  // split the user had -- "go fullscreen but can still get back".
  const [subProjectOrientation, setSubProjectOrientation] = useState<'stack' | 'side'>('stack');
  const [subProjectFullscreen, setSubProjectFullscreen] = useState(false);
  const [subProjectRatio, setSubProjectRatio] = useState(0.45);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const subProjectPaneRef = useRef<HTMLDivElement>(null);
  // Live-drags via direct style mutation on the ref (no setState per pixel)
  // -- committing every mousemove to React state was re-rendering the
  // entire embedded sub-project RecordDashboard tree dozens of times a
  // second, which is what made the old height-drag handle feel laggy.
  // `liveRatio` carries the in-progress value across to mouseup, where it's
  // committed to state exactly once.
  const dragRef = useRef<{ orientation: 'stack' | 'side'; startPos: number; startRatio: number; containerSize: number; liveRatio: number } | null>(null);
  const [linkedItems, setLinkedItems] = useState<Record<string, { id: string; name: string }[]>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasPendingArchiveRequest, setHasPendingArchiveRequest] = useState(false);
  // Every tab_type's own component (RecordDashboardTab, InvoicesTab,
  // TrustAccountTab, ...) fetches its own data on mount -- previously
  // renderTabContent only ever rendered whichever tab was CURRENTLY active,
  // so switching back to a tab you'd already visited unmounted and
  // remounted it from scratch every time, paying the full fetch again.
  // Tracking which tabs have been opened at least once lets renderTabContent
  // keep every visited tab mounted (hidden via CSS, not unmounted) below --
  // first visit still pays the real fetch, every revisit after that is
  // instant. Cleared implicitly on remount (new recordId), same as every
  // other piece of state here.
  const [visitedTabIds, setVisitedTabIds] = useState<Set<string>>(new Set());

  const recordTable = systemTable || tableId || '';

  // ── Effects ────────────────────────────────────────────────────

  useEffect(() => { loadAll(); }, [recordId]);

  // useLayoutEffect, not useEffect -- runs synchronously before the browser
  // paints, so a newly-selected not-yet-visited tab is already in
  // visitedTabIds by the time renderTabContent's filter below actually
  // paints, instead of flashing one blank frame first.
  useLayoutEffect(() => {
    if (!activeTabId) return;
    // Layout-editing is a single shared flag, not per-tab -- without
    // clearing it here, leaving a custom_dashboard tab mid-edit and
    // switching to another one (now kept mounted below) would carry
    // isEditing=true straight into a tab the user never asked to edit.
    setIsEditingLayout(false);
    setVisitedTabIds(prev => (prev.has(activeTabId) ? prev : new Set(prev).add(activeTabId)));
  }, [activeTabId]);

  useEffect(() => {
    const entityTable = systemTable || 'company_table_records';
    supabase.from('archive_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('entity_table', entityTable)
      .eq('entity_id', recordId)
      .eq('status', 'pending')
      .then(({ count }) => setHasPendingArchiveRequest(!!count));
  }, [recordId, systemTable]);

  // Which trust this entity is trustee for, if any -- feeds the synthetic
  // "Trust" field (see withTrustField below) the same linkedItems shape
  // every other relation field already uses, since that field doesn't come
  // from a real column the normal linkedItems-loading pass would ever see.
  const trusteeRolesKey = (record?.roles || []).join(',');
  useEffect(() => {
    if (systemTable !== 'entities' || !record?.roles?.some((r: string) => TRUSTEE_ROLE_TYPES.includes(r))) return;
    supabase.from('entity_relationships')
      .select('parent_entity_id, trust:parent_entity_id(name)')
      .eq('child_entity_id', recordId).eq('relationship_type', 'Trustee')
      .or('is_current.is.null,is_current.eq.true')
      .maybeSingle()
      .then(({ data }) => {
        setLinkedItems(prev => ({ ...prev, trust_link: (data as any)?.parent_entity_id ? [{ id: (data as any).parent_entity_id, name: (data as any).trust?.name || 'Untitled' }] : [] }));
      });
  }, [systemTable, recordId, trusteeRolesKey]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const pane = subProjectPaneRef.current;
      if (!drag || !pane) return;
      const pos = drag.orientation === 'side' ? e.clientX : e.clientY;
      // Sub-project pane sits AFTER the divider (to the right / below), so
      // moving the handle further along the axis shrinks it and grows the
      // main pane before it -- hence the negated delta.
      const deltaRatio = -(pos - drag.startPos) / drag.containerSize;
      const nextRatio = Math.min(0.8, Math.max(0.15, drag.startRatio + deltaRatio));
      pane.style.flexBasis = `${nextRatio * 100}%`;
      drag.liveRatio = nextRatio;
    };
    const onUp = () => {
      if (dragRef.current) setSubProjectRatio(dragRef.current.liveRatio);
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startSubProjectDrag = (e: React.MouseEvent) => {
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragRef.current = {
      orientation: subProjectOrientation,
      startPos: subProjectOrientation === 'side' ? e.clientX : e.clientY,
      startRatio: subProjectRatio,
      containerSize: subProjectOrientation === 'side' ? rect.width : rect.height,
      liveRatio: subProjectRatio,
    };
  };

  // ── Data loaders ───────────────────────────────────────────────

  const perfName = systemTable || tableName || 'custom';

  const loadAll = async () => {
    // Skip the blank/loading gate when we already have this exact record's
    // data pre-fetched from the master table row click (the common entry
    // path) -- the header/fields can render immediately from it while tabs/
    // fields/linked-items resolve underneath, instead of the whole screen
    // going blank for the full waterfall even though most of it is already
    // on screen. A genuinely different record (sub-project switch, direct
    // load) still gets the normal loading gate.
    const hasMatchingInitialData = !!initialRecord && initialRecord.id === recordId;
    if (!hasMatchingInitialData) setLoading(true);
    setTabsLoaded(false);
    perfLogPageStart('record', perfName);

    // companyId/isAdmin are already resolved once per session by
    // CompanyContext (see app/dashboard/layout.tsx) -- reusing that instead
    // of re-running auth.getUser()+profiles+company_memberships on every
    // single record open removes sequential round trips from the critical
    // path in the common case. Falls back to the direct lookups only if
    // context genuinely hasn't resolved yet (e.g. a very early deep link).
    //
    // loadRecord/loadSubProjects don't depend on companyId at all (they key
    // purely off recordId, relying on RLS) -- kicking them off here, before
    // companyId/admin resolve, instead of behind them removes that wait
    // from the critical path entirely rather than just shortening it.
    // Confirmed live: the fallback branch used to serialize auth.getUser()
    // twice (once inside the old getCompanyId() call, once again right
    // after) plus a separate company_memberships query, all before the
    // record fetch even started -- exactly the "session resolves, then a
    // wait, then data resolves" pattern reported. Only loadTabs/loadFields
    // actually need companyId (schema is company-scoped), so only those
    // wait on it now.
    const recordPromise = loadRecord();
    const subProjectsPromise = loadSubProjects();

    let cid = ctxCompanyId;
    let admin = ctxIsAdmin;
    if (!cid) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      // Same "one getUser() call, then parallel profile+membership" shape
      // as lib/documentTemplateAuth.ts's authorizeCompanyMember() -- fetch
      // every membership (not company-filtered, since cid isn't known yet)
      // and match it client-side once cid resolves.
      const [{ data: prof }, { data: memberships }] = await Promise.all([
        supabase.from('profiles').select('active_company_id').eq('id', user.id).single(),
        supabase.from('company_memberships').select('company_id, role').eq('user_id', user.id),
      ]);
      cid = prof?.active_company_id;
      if (!cid) { setLoading(false); return; }
      admin = memberships?.find(m => m.company_id === cid)?.role === 'company_admin';
    }
    setCompanyId(cid);
    setIsAdmin(admin);
    perfLog(`RecordDashboard(${perfName}): companyId+admin resolved`);

    const [rec, , flds] = await Promise.all([recordPromise, loadTabs(cid), loadFields(cid), subProjectsPromise]);
    setTabsLoaded(true);
    perfLog(`RecordDashboard(${perfName}): record/tabs/fields/subProjects resolved`);
    await Promise.all([resolveLinkedItems(rec, flds), loadParent(rec)]);
    perfLog(`RecordDashboard(${perfName}): linked items + parent resolved`);
    setLoading(false);
    perfLogPageReady('record', perfName);
  };

  const loadRecord = async () => {
    if (systemTable) {
      // Fetch the row + its custom field values in parallel -- both are
      // independent lookups keyed only on recordId, no need to serialize
      // them like before.
      const [{ data }, { data: cfValues }] = await Promise.all([
        supabase.from(systemTable).select('*').eq('id', recordId).single(),
        supabase
          .from('company_custom_field_values')
          .select('field_id, value_text, value_number, value_date, value_boolean, value_record_id')
          .eq('record_id', recordId)
          .eq('table_name', systemTable),
      ]);

      if (!data) return;

      // Merge custom field values into record using field_id as key. For a
      // relation-type field (entity/property/project) this is the raw
      // linked record's id -- resolveLinkedItems below turns it into a
      // display name; the picker itself edits via handleAddLinked, which
      // writes straight back into this same column.
      const customValues: Record<string, any> = {};
      (cfValues || []).forEach(v => {
        // value_record_id checked FIRST -- see
        // components/GenericMasterTable.tsx's fetchCustomFields for why
        // (lib/ai/actions.ts's insertCustomFieldValues writes both this and
        // value_text for an entity field it creates; checking value_text
        // first would pick up that plain display name instead of the real
        // linked id resolveLinkedItems below needs).
        customValues[v.field_id] =
          v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean;
      });

      const merged = { ...data, ...customValues };
      setRecord(merged);
      return merged;
    } else if (tableId) {
      const { data: rec } = await supabase
        .from('company_table_records')
        .select('*, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean)')
        .eq('id', recordId)
        .single();

      if (rec) {
        const values: Record<string, any> = {};
        (rec.values || []).forEach((v: any) => {
          values[v.field_id] =
            v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean;
        });
        const merged2 = { id: rec.id, created_at: rec.created_at, ...values };
        setRecord(merged2);
        return merged2;
      }
    }
    return null;
  };

  // Load linked items — custom fields from linked_values table, base relation fields from record directly
  // Accepts rec and flds directly to avoid stale state after Promise.all
  const resolveLinkedItems = async (rec?: Record<string, any> | null, flds?: FieldLayout[]) => {
    const currentRecord = rec ?? record;
    const currentFields = flds ?? fields;
    const map: Record<string, { id: string; name: string }[]> = {};

    // ── Custom linked fields (entity/property/project) ──────────
    // The linked record's id lives in company_custom_field_values.value_record_id
    // (already merged into currentRecord by loadRecord) -- resolve each to a
    // display name from its target table. (There used to be a separate
    // company_custom_field_linked_values table for this; it's been migrated
    // into the canonical value_record_id column, matching every other writer
    // of entity/property/project custom fields in this app.)
    const CUSTOM_LINKED_TABLES: Record<string, { table: string; nameColumn: string }> = {
      entity: { table: 'entities', nameColumn: 'name' },
      property: { table: 'properties', nameColumn: 'street_address' },
      project: { table: 'projects', nameColumn: 'name' },
    };
    const customLinkedFields = currentFields.filter(f =>
      f.field_source === 'custom' && f.fieldType in CUSTOM_LINKED_TABLES
    );
    await Promise.all(customLinkedFields.map(async f => {
      const storedId = currentRecord?.[f.id];
      // NewProjectModal.tsx's custom-field form renders a plain text input
      // for "entity" fields (only number/boolean/date get special
      // handling), so storedId can genuinely be a typed display name with
      // no real link behind it, never written to value_record_id at all --
      // skip rather than let a malformed uuid 400 this lookup.
      if (!storedId || !UUID_RE.test(storedId)) return;
      const { table, nameColumn } = CUSTOM_LINKED_TABLES[f.fieldType];
      const { data } = await supabase.from(table).select(`id, ${nameColumn}`).eq('id', storedId).single();
      if (data) map[f.id] = [{ id: storedId, name: (data as any)[nameColumn] || 'Untitled' }];
    }));

    // ── Person link fields — value is stored as text name directly ──
    const personLinkFields = currentFields.filter(f =>
      f.field_source === 'base' && f.fieldType === 'person_link'
    );
    for (const f of personLinkFields) {
      const storedName = currentRecord?.[f.field_key];
      if (storedName) map[f.field_key] = [{ id: storedName, name: storedName }];
    }

    // ── Base relation fields (e.g. property_id) ──────────
    const baseRelationFields = currentFields.filter(f =>
      f.field_source === 'base' && f.fieldType === 'relation'
    );
    await Promise.all(baseRelationFields.map(async f => {
      const table = f.relationTable;
      const nameCol = f.relationDisplayColumn || 'name';
      if (!table) return;

      // Junction-backed relations (e.g. property_id) — multiple linked records
      if (f.relationJunction) {
        const { table: junctionTable, sourceCol, targetCol } = f.relationJunction;
        const { data } = await supabase
          .from(junctionTable)
          .select(`${targetCol}, linked:${table}(id, ${nameCol})`)
          .eq(sourceCol, recordId);
        map[f.field_key] = (data || [])
          .map((row: any) => row.linked)
          .filter(Boolean)
          .map((linked: any) => ({ id: linked.id, name: linked[nameCol] || 'Untitled' }));
        return;
      }

      const storedId = currentRecord?.[f.field_key];
      if (!storedId) return;
      const { data } = await supabase
        .from(table).select(`id, ${nameCol}`).eq('id', storedId).single();
      if (data) map[f.field_key] = [{ id: storedId, name: (data as any)[nameCol] || 'Untitled' }];
    }));

    setLinkedItems(map);
  };
  const loadFields = async (cid: string) => {
    if (systemTable) {
      // Both are shared, cached lookups (schemaService caches the RPC by
      // table+company; fetchCompanyCustomFields shares the same cache
      // Sidebar/GenericMasterTable already warm for this table) -- most
      // record opens hit warm cache on both and do zero network round
      // trips here at all. Run in parallel regardless, for the cold case.
      const [schemaCols, customFields] = await Promise.all([
        getSchemaMetadata(systemTable, cid),
        fetchCompanyCustomFields(cid, systemTable),
      ]);

      const baseFields: FieldLayout[] = (schemaCols || [])
        .filter((c: any) => ['data', 'relation'].includes(c.category) && !c.is_hidden && !SYSTEM_TABLE_HIDDEN_COLS.includes(c.column_name))
        .map((c: any, i: number) => {
          const relOverride = SYSTEM_TABLE_RELATION_MAP[c.column_name];
          const isPersonLink = SYSTEM_TABLE_PERSON_LINK_COLS.includes(c.column_name);
          // entities.entity_type doubles as the multi-select editor for
          // entities.roles (see supabase/migrations/20260729420000_
          // entities_multi_role.sql) -- 'roles' itself is hidden
          // (SYSTEM_TABLE_HIDDEN_COLS) so it never shows as a separate
          // field; this one field edits both together (see the
          // recordValues override below and handleFieldSave's roles
          // special-case) instead of showing "Entity Type" and "Roles" as
          // two confusingly-overlapping fields.
          const isEntityTypeRoles = systemTable === 'entities' && c.column_name === 'entity_type';
          return {
            id: c.column_name,
            field_key: c.column_name,
            field_source: 'base' as const,
            label: c.label || c.column_name.replace(/_/g, ' '),
            fieldType:
              isEntityTypeRoles ? 'multiselect'
              : relOverride ? 'relation'
              : isPersonLink ? 'person_link'
              : c.category === 'relation' ? 'relation'
              : c.data_type === 'boolean' ? 'boolean'
              : c.data_type?.includes('timestamp') ? 'date'
              : ['numeric', 'integer'].includes(c.data_type) ? 'number'
              : 'text',
            selectOptions: isEntityTypeRoles ? ENTITY_TYPES : undefined,
            relationTable: relOverride?.table || c.relation_table || undefined,
            relationDisplayColumn: relOverride?.displayCol || c.relation_display_column || undefined,
            relationJunction: relOverride?.junction || undefined,
            col_start: 1,
            col_span: 6,
            row_order: i,
          };
        });

      const cfFields: FieldLayout[] = (customFields || []).map((cf: any, i: number) => ({
        id: cf.id,
        field_key: cf.id,
        field_source: 'custom' as const,
        label: cf.label,
        fieldType: cf.field_type,
        selectOptions: cf.select_options || undefined,
        col_start: 1,
        col_span: 6,
        row_order: baseFields.length + i,
        autoNumber: { prefix: cf.auto_number_prefix ?? null, start: cf.auto_number_start ?? null, pad: cf.auto_number_pad ?? null },
      }));

      const allFields = [...baseFields, ...cfFields];
      setFields(allFields);
      return allFields;
    } else if (tableId) {
      const { data: tableFields } = await supabase
        .from('company_table_fields')
        .select('*')
        .eq('table_id', tableId)
        .is('deleted_at', null)
        .order('display_order');

      const mappedFields = (tableFields || []).map((f: any, i: number) => ({
        id: f.id,
        field_key: f.id,
        field_source: 'custom' as const,
        label: f.label,
        fieldType: f.field_type,
        selectOptions: f.select_options || undefined,
        col_start: 1,
        col_span: 6,
        row_order: i,
        autoNumber: { prefix: f.auto_number_prefix ?? null, start: f.auto_number_start ?? null, pad: f.auto_number_pad ?? null },
      }));
      setFields(mappedFields);
      return mappedFields;
    }
  };

  // Persists the pre-built widgets (quick-add form + totals-row grid) for
  // any newly-inserted default project-dashboard tabs -- record_tabs itself
  // has no widgets column, that lives in the separate
  // record_tab_dashboard_widgets table (see RecordDashboardTab.tsx's own
  // saveWidgets, which this mirrors for the one-time default-seed case).
  const seedDefaultDashboardWidgets = async (
    insertedTabs: { id: string; linked_table_id: string | null }[],
    widgetsByLinkedTableId: Map<string, DashboardWidget[]>,
  ) => {
    const rows = insertedTabs
      .filter(t => t.linked_table_id && widgetsByLinkedTableId.has(t.linked_table_id))
      .map(t => ({ tab_id: t.id, widgets: widgetsByLinkedTableId.get(t.linked_table_id!), updated_at: new Date().toISOString() }));
    if (rows.length) await supabase.from('record_tab_dashboard_widgets').upsert(rows, { onConflict: 'tab_id' });
  };

  const loadTabs = async (cid: string) => {
    // Fetched fresh here rather than reading the `customTables` state
    // (from useCustomTables(ctxUserId) above) -- loadTabs runs once, fired
    // from the loadAll() effect at mount, and its closure over `customTables`
    // is frozen at whatever that state happened to be AT THAT MOMENT.
    // Confirmed live: on a hard reload / direct URL open of a matter that's
    // never had its default tabs seeded, this effect reliably wins the race
    // against useCustomTables' own fetch (which needs its own round trip),
    // so every customTables.some(...) gate below saw an empty array and
    // silently skipped seeding Trust Account/Finance Model/Precedents/Time &
    // Fees/Disbursements -- permanently, since nothing ever retries once
    // this function has already run. A plain client-side navigation into
    // the same matter doesn't show the bug (CompanyContext/useCustomTables
    // are already warm from the app shell by then), which is why it went
    // unnoticed. Only `id`/`slug` are needed by anything below.
    const [{ data: tabData }, { data: tablesForSeeding }] = await Promise.all([
      supabase.from('record_tabs').select('*').eq('record_id', recordId).eq('record_table', recordTable).order('display_order'),
      supabase.from('company_tables').select('id, slug').eq('company_id', cid).is('deleted_at', null),
    ]);
    const seedTables = tablesForSeeding || [];

    if (tabData && tabData.length > 0) {
      // Deduplicate — keep only first tab of each title
      const seen = new Set<string>();
      const uniqueTabs = tabData.filter(t => {
        if (seen.has(t.title)) return false;
        seen.add(t.title);
        return true;
      });
      // Delete duplicate tabs from DB
      const dupeIds = tabData.filter(t => !uniqueTabs.find(u => u.id === t.id)).map(t => t.id);
      if (dupeIds.length > 0) {
        await supabase.from('record_tabs').delete().in('id', dupeIds);
      }

      // Fired immediately so it runs concurrently with the top-up logic
      // below instead of waiting behind it -- it's independent of whether
      // any default tabs get inserted.
      const fieldTabIds = tabData
        .filter(t => t.tab_type === 'fields')
        .map(t => t.id);
      const fieldLayoutsPromise = fieldTabIds.length > 0
        ? supabase.from('record_tab_fields').select('*').in('tab_id', fieldTabIds).order('row_order')
        : Promise.resolve({ data: [] as any[] });

      let finalTabs = uniqueTabs;
      const existingLinkedTableIds = new Set(uniqueTabs.map(t => t.linked_table_id).filter(Boolean));

      // Backfill 'Details' (and, for projects, 'Checklist') if this record
      // has other tabs but neither of these -- normally both are seeded
      // together the very first time a record is ever opened (the
      // empty-tabs branch below), but a record can end up with tabs
      // WITHOUT ever going through that path: Admin > Default Tabs' "Add
      // default tab" eagerly backfills its new tab onto every existing
      // Matter, including ones that had zero tabs -- which then never
      // takes the empty-tabs branch again, so it never gets a Details tab.
      // Matched by tab_type, not title, since a user may have renamed
      // their Details tab. Idempotent, same contract as every other
      // top-up here.
      const missingCoreTabs: any[] = [];
      if (!uniqueTabs.some(t => t.tab_type === 'fields')) {
        missingCoreTabs.push({
          company_id: cid, record_id: recordId, record_table: recordTable,
          title: 'Details', icon: 'FileText', tab_type: 'fields',
          display_order: finalTabs.length + missingCoreTabs.length,
        });
      }
      if (systemTable === 'projects' && !uniqueTabs.some(t => t.tab_type === 'checklist')) {
        missingCoreTabs.push({
          company_id: cid, record_id: recordId, record_table: recordTable,
          title: 'Checklist', icon: 'CheckSquare', tab_type: 'checklist',
          display_order: finalTabs.length + missingCoreTabs.length,
        });
      }
      // Finance Model is a Niksen-specific feature backed by its own
      // company_tables (finance-model-budget-lines etc.) -- unlike
      // Checklist above (generic, empty until a company adds its own
      // templates), it must NOT auto-seed onto every tenant's projects
      // just because systemTable === 'projects'. Gated the same way Time &
      // Fees/Disbursements already are (buildMissingDefaultProjectDashboardTabs
      // below): only if the company actually has the underlying table.
      // Cross-tenant leak fixed here previously showed this tab on a law
      // firm's Matters with no Finance Model data behind it at all.
      if (systemTable === 'projects' && seedTables.some(t => t.slug === 'finance-model-budget-lines') && !uniqueTabs.some(t => t.tab_type === 'finance_model')) {
        missingCoreTabs.push({
          company_id: cid, record_id: recordId, record_table: recordTable,
          title: 'Finance Model', icon: 'TrendingUp', tab_type: 'finance_model',
          display_order: finalTabs.length + missingCoreTabs.length,
        });
      }
      // Trust Account -- same Law Firm-template gate as Finance Model above.
      // Supersedes the old generic 'custom_dashboard' grid the
      // 'trust-transactions' spec in defaultRecordDashboardTabs.ts used to
      // seed (migrated to this tab_type by
      // supabase/migrations/20260802170000_trust_account_tab.sql), so this
      // check only ever fires for a matter that somehow has neither.
      if (systemTable === 'projects' && seedTables.some(t => t.slug === 'trust-transactions') && !uniqueTabs.some(t => t.tab_type === 'trust_account')) {
        missingCoreTabs.push({
          company_id: cid, record_id: recordId, record_table: recordTable,
          title: 'Trust Account', icon: 'Landmark', tab_type: 'trust_account',
          display_order: finalTabs.length + missingCoreTabs.length,
        });
      }
      // Precedents -- seeded directly below Trust Account. Gated on the
      // company having the Law Firm template (same 'trust-transactions'
      // signal as Trust Account above -- Precedents is that template's own
      // seeded document library, not a generic feature) AND actually having
      // a precedent library, so a non-law-firm tenant doesn't get an empty
      // tab, or a tab at all if it somehow has precedent rows of its own
      // (see app/api/precedents/route.ts's matching server-side guard). The
      // count query is deliberately inside the "tab is missing" check: once
      // seeded, uniqueTabs short-circuits it and this never queries again on
      // subsequent record loads.
      if (systemTable === 'projects' && seedTables.some(t => t.slug === 'trust-transactions') && !uniqueTabs.some(t => t.tab_type === 'precedents')) {
        const { count: precedentCount } = await supabase
          .from('precedents')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', cid)
          .eq('record_table', 'projects')
          .eq('is_system', false)
          .is('deleted_at', null);
        if (precedentCount) {
          missingCoreTabs.push({
            company_id: cid, record_id: recordId, record_table: recordTable,
            title: 'Precedents', icon: 'PenSquare', tab_type: 'precedents',
            display_order: finalTabs.length + missingCoreTabs.length,
          });
        }
      }
      if (systemTable === 'entities' && !uniqueTabs.some(t => t.tab_type === 'related_matters')) {
        missingCoreTabs.push({
          company_id: cid, record_id: recordId, record_table: recordTable,
          title: 'Related Matters', icon: 'Briefcase', tab_type: 'related_matters',
          display_order: finalTabs.length + missingCoreTabs.length,
        });
      }
      if (missingCoreTabs.length) {
        const { data: insertedCoreTabs } = await supabase.from('record_tabs').insert(missingCoreTabs).select();
        if (insertedCoreTabs?.length) finalTabs = [...finalTabs, ...insertedCoreTabs];
      }

      // Top up any default project-dashboard tabs (Time & Fees,
      // Disbursements) this record doesn't have yet -- covers matters that
      // were first opened (and so already got their "Details" tab) before
      // these defaults existed, not just brand-new ones. Idempotent: a
      // matter that already has both is a no-op every subsequent load.
      if (systemTable === 'projects') {
        const { tabs: missingTabs, widgetsByLinkedTableId } = await buildMissingDefaultProjectDashboardTabs(
          cid, recordId, finalTabs.length, existingLinkedTableIds, seedTables
        );
        if (missingTabs.length) {
          const { data: insertedTabs } = await supabase.from('record_tabs').insert(missingTabs).select();
          if (insertedTabs?.length) {
            await seedDefaultDashboardWidgets(insertedTabs, widgetsByLinkedTableId);
            finalTabs = [...finalTabs, ...insertedTabs];
            insertedTabs.forEach(t => t.linked_table_id && existingLinkedTableIds.add(t.linked_table_id));
          }
        }
      }
      // Template-installed record-tab defaults (company_record_tab_defaults,
      // see supabase/template_record_tabs.sql) -- any record table, same
      // idempotent top-up contract as the hardcoded project specs above.
      {
        const { tabs: defaultTabsMissing, widgetsByLinkedTableId } = await buildMissingDefaultTabsFromCompanyDefaults(
          cid, recordTable, recordId, finalTabs.length, existingLinkedTableIds
        );
        if (defaultTabsMissing.length) {
          const { data: insertedTabs } = await supabase.from('record_tabs').insert(defaultTabsMissing).select();
          if (insertedTabs?.length) {
            await seedDefaultDashboardWidgets(insertedTabs, widgetsByLinkedTableId);
            finalTabs = [...finalTabs, ...insertedTabs];
          }
        }
      }

      // Details is always the first tab -- backfilling it above appends to
      // the end of finalTabs, so a record that had e.g. Time & Fees as its
      // only tab before Details existed would otherwise open straight into
      // Time & Fees every time (TabBar pins index 0 the same way so a drag
      // reorder can't undo this either). Only reorders + persists
      // display_order when something's actually out of place, so this is a
      // no-op write on every normal load.
      const fieldsIdx = finalTabs.findIndex(t => t.tab_type === 'fields');
      if (fieldsIdx > 0) {
        const [detailsTab] = finalTabs.splice(fieldsIdx, 1);
        finalTabs = [detailsTab, ...finalTabs].map((t, i) => ({ ...t, display_order: i }));
        await Promise.all(finalTabs.map(t =>
          supabase.from('record_tabs').update({ display_order: t.display_order }).eq('id', t.id)
        ));
      }

      setTabs(finalTabs);
      // Arriving from the precedent library with ?precedent=<id>: open the
      // Precedents tab rather than the first one, so the hand-off from
      // PrecedentLibraryBrowser's "Use on a matter" lands where it promised.
      // Same idea for ?tab=<tab_type> (e.g. a trust ledger row's "Matter"
      // link landing straight on that matter's Trust Account tab) -- checked
      // second so an explicit ?precedent= link still wins if somehow both
      // are present.
      const precedentTab = initialPrecedentId && finalTabs.find(t => t.tab_type === 'precedents');
      const deepLinkTab = !precedentTab && initialTabType && finalTabs.find(t => t.tab_type === initialTabType);
      setActiveTabId(precedentTab ? precedentTab.id : deepLinkTab ? deepLinkTab.id : finalTabs[0].id);

      const { data: layouts } = await fieldLayoutsPromise;
      if (layouts?.length) {
        const byTab: Record<string, FieldLayout[]> = {};
        layouts.forEach((l: any) => {
          if (!byTab[l.tab_id]) byTab[l.tab_id] = [];
          byTab[l.tab_id].push(l);
        });
        setTabFieldLayouts(byTab);
      }
    } else {
      // Default tabs differ by table type
      const defaultTabs = [
        {
          company_id: cid,
          record_id: recordId,
          record_table: recordTable,
          title: 'Details',
          icon: 'FileText',
          tab_type: 'fields',
          display_order: 0,
        },
        ...(systemTable === 'projects' ? [{
          company_id: cid,
          record_id: recordId,
          record_table: recordTable,
          title: 'Checklist',
          icon: 'CheckSquare',
          tab_type: 'checklist',
          display_order: 1,
        }] : []),
        // Finance Model is Niksen-specific -- gated on the company actually
        // having the underlying custom tables, unlike Checklist above. See
        // the matching comment on the top-up path further up this file.
        ...(systemTable === 'projects' && seedTables.some(t => t.slug === 'finance-model-budget-lines') ? [{
          company_id: cid,
          record_id: recordId,
          record_table: recordTable,
          title: 'Finance Model',
          icon: 'TrendingUp',
          tab_type: 'finance_model',
          display_order: 2,
        }] : []),
        // Trust Account -- same Law Firm-template gate as Finance Model above.
        ...(systemTable === 'projects' && seedTables.some(t => t.slug === 'trust-transactions') ? [{
          company_id: cid,
          record_id: recordId,
          record_table: recordTable,
          title: 'Trust Account',
          icon: 'Landmark',
          tab_type: 'trust_account',
          display_order: 3,
        }] : []),
        ...(systemTable === 'entities' ? [{
          company_id: cid,
          record_id: recordId,
          record_table: recordTable,
          title: 'Related Matters',
          icon: 'Briefcase',
          tab_type: 'related_matters',
          display_order: 1,
        }] : []),
      ];

      let widgetsByLinkedTableId = new Map<string, DashboardWidget[]>();
      if (systemTable === 'projects') {
        const result = await buildMissingDefaultProjectDashboardTabs(cid, recordId, defaultTabs.length, new Set(), seedTables);
        defaultTabs.push(...result.tabs);
        widgetsByLinkedTableId = result.widgetsByLinkedTableId;
      }
      // Template-installed record-tab defaults, first-open path (see the
      // same top-up in the tabs-exist branch above).
      {
        const covered = new Set(Array.from(widgetsByLinkedTableId.keys()));
        const result = await buildMissingDefaultTabsFromCompanyDefaults(cid, recordTable, recordId, defaultTabs.length, covered);
        defaultTabs.push(...result.tabs);
        result.widgetsByLinkedTableId.forEach((v, k) => widgetsByLinkedTableId.set(k, v));
      }

      const { data: newTabs } = await supabase
        .from('record_tabs')
        .insert(defaultTabs)
        .select();

      if (newTabs?.length) {
        await seedDefaultDashboardWidgets(newTabs, widgetsByLinkedTableId);
        setTabs(newTabs);
        // Same ?tab=<tab_type> deep link as the existing-tabs branch above,
        // for a matter opened this way for the very first time.
        const deepLinkTab = initialTabType && newTabs.find(t => t.tab_type === initialTabType);
        setActiveTabId(deepLinkTab ? deepLinkTab.id : newTabs[0].id);
      }
    }
  };

  const loadSubProjects = async () => {
    if (systemTable !== 'projects') return;
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .eq('parent_project_id', recordId)
      .is('deleted_at', null)
      .order('created_at');
    setSubProjects(data || []);
  };

  // Takes the already-fetched record instead of re-fetching this same row
  // by id just to read parent_project_id off it -- loadRecord's `select('*')`
  // already has that column, so this used to spend a full extra round trip
  // duplicating a fetch that had already happened moments earlier.
  const loadParent = async (rec?: Record<string, any> | null) => {
    if (systemTable !== 'projects') return;
    const parentId = rec?.parent_project_id;
    if (!parentId) { setParentRecord(null); return; }
    const { data: parent } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', parentId)
      .single();
    setParentRecord(parent || null);
  };

  // ── Tab handlers ───────────────────────────────────────────────

  const handleAddTab = async (
    type: string, title: string, icon: string, linkedTableId?: string
  ) => {
    // Manually adding a tab pointing at the Time & Fee Entries/Disbursements/
    // Invoices table needs the same billing_role tag the auto-created
    // defaults get (see lib/dashboardWidgets/defaultRecordDashboardTabs.ts) --
    // CreateInvoiceModal/InvoicesTab resolve "this matter's fee sources" by
    // querying record_tabs for that tag, never by title/slug directly, so a
    // tab created without it is invisible to Create Invoice even though it
    // looks and works identically otherwise. Matched by slug, not title,
    // since a manually-added tab's title is freely editable.
    const linkedTable = linkedTableId ? customTables.find(t => t.id === linkedTableId) : null;
    const billingRole =
      linkedTable?.slug === 'time-fee-entries' || linkedTable?.slug === 'disbursements' ? 'fee_source'
      : linkedTable?.slug === 'invoices' ? 'invoices'
      : null;

    // Manually re-adding Time & Fees/Disbursements (e.g. it was removed, or
    // this record type doesn't get it automatically) used to insert a bare
    // record_tabs row with no widgets at all -- billing_role tagging worked,
    // but the tab itself rendered nothing, confirmed live. Seed it with the
    // exact same quick-add-form + totals grid the automatic default tab
    // gets (see buildMissingDefaultProjectDashboardTabs), scoped to THIS
    // record the same way -- RecordDashboardTab.tsx's own fixedValues
    // locking applies to any grid/quick_add_form widget regardless of how
    // the tab was created.
    const spec = linkedTable ? DEFAULT_PROJECT_DASHBOARD_TAB_SPECS.find(s => s.slug === linkedTable.slug) : null;
    const widgets = spec && linkedTable ? await buildDefaultTabWidgetsForSpec(linkedTable.id, spec) : null;

    const { data } = await supabase
      .from('record_tabs')
      .insert({
        company_id: companyId,
        record_id: recordId,
        record_table: recordTable,
        title,
        icon,
        tab_type: type,
        linked_table_id: linkedTableId || null,
        display_order: tabs.length,
        billing_role: billingRole,
      })
      .select()
      .single();

    if (data) {
      // record_tabs itself has no widgets column -- that lives in the
      // separate record_tab_dashboard_widgets table, see
      // seedDefaultDashboardWidgets above.
      if (widgets) await seedDefaultDashboardWidgets([data], new Map([[data.linked_table_id, widgets]]));
      setTabs(prev => [...prev, data]);
      setActiveTabId(data.id);
    }
  };

  const handleRenameTab = async (tabId: string, title: string) => {
    await supabase.from('record_tabs').update({ title }).eq('id', tabId);
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t));
  };

  const handleDeleteTab = async (tabId: string) => {
    if (!window.confirm('Remove this tab?')) return;
    await supabase.from('record_tabs').delete().eq('id', tabId);
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId && next.length > 0) setActiveTabId(next[0].id);
      return next;
    });
  };

  const handleReorderTabs = async (reordered: RecordTab[]) => {
    setTabs(reordered);
    await Promise.all(
      reordered.map(t =>
        supabase.from('record_tabs')
          .update({ display_order: t.display_order })
          .eq('id', t.id)
      )
    );
  };

  // ── Field save ─────────────────────────────────────────────────

  const isLinkedField = (fieldType: string) => ['entity', 'property', 'project'].includes(fieldType);

  // Whether this field's raw value in `record` is a linked record id rather
  // than a plain scalar -- true for base 'relation' fields and custom
  // entity/property/project fields (NOT 'person_link', which stores its
  // display name as plain text directly, see resolveLinkedItems above).
  // Used to keep any "first field's value" fallback display text (record
  // title, delete-confirmation label) from ever showing a raw uuid when
  // that first field happens to be a relation.
  const isRelationField = (f: FieldLayout) =>
    (f.field_source === 'base' && f.fieldType === 'relation') ||
    (f.field_source === 'custom' && isLinkedField(f.fieldType));
  const rawFieldValue = (f: FieldLayout) => record?.[f.field_source === 'custom' ? f.id : f.field_key];
  const fallbackLabelField = fields.find(f => !isRelationField(f) && rawFieldValue(f));
  const fallbackLabelValue = fallbackLabelField ? rawFieldValue(fallbackLabelField) : undefined;

  const handleAddLinked = async (fieldId: string, item: { id: string; name: string }) => {
    // The synthetic "Trust" field (see withTrustField) -- not a real field
    // definition (only injected at render time, never present in the
    // `fields` state the lookup below needs), so it has to be handled
    // before that lookup returns early. Writes onto entity_relationships
    // instead of a real column (same shape components/entities/
    // TrustLinkField.tsx and the Client Update Page .../trust route both
    // already use).
    if (systemTable === 'entities' && fieldId === 'trust_link') {
      let resolvedId = item.id;
      const resolvedName = item.name;
      if (resolvedId.startsWith('__new__')) {
        const { data: created, error: createError } = await supabase.from('entities')
          .insert({ company_id: companyId, name: resolvedName, entity_type: 'Discretionary Family Trust' }).select('id').single();
        if (createError || !created) { window.alert(createError?.message || `Couldn't create "${resolvedName}"`); return; }
        resolvedId = created.id;
      }
      const { data: existing } = await supabase.from('entity_relationships')
        .select('id').eq('child_entity_id', recordId).eq('relationship_type', 'Trustee').maybeSingle();
      const { error } = existing
        ? await supabase.from('entity_relationships').update({ parent_entity_id: resolvedId, is_current: true }).eq('id', existing.id)
        : await supabase.from('entity_relationships').insert({ parent_entity_id: resolvedId, child_entity_id: recordId, relationship_type: 'Trustee', is_current: true });
      if (error) { window.alert(error.message); return; }
      setLinkedItems(prev => ({ ...prev, trust_link: [{ id: resolvedId, name: resolvedName }] }));
      invalidateEntityRelationCache();
      return;
    }

    const field = fields.find(f => f.id === fieldId || f.field_key === fieldId);
    if (!field) return;

    // Resolve a "__new__..." create-on-save placeholder into a real row
    // FIRST, before any branch below -- every one of them needs a real id,
    // not the placeholder string. This used to only run for custom
    // entity/property/project fields, *after* the base-relation branches
    // had already returned early -- so creating a brand-new property (or
    // any other base relation field, e.g. Parent Property when the matter
    // has none yet) tried to save the literal text "__new__<name>" into a
    // uuid column and failed outright, with nothing checking the result.
    let resolvedId = item.id;
    let resolvedName = item.name;
    if (item.id.startsWith('__new__')) {
      const newName = item.name;
      const targetTable = field.fieldType === 'entity' ? 'entities'
        : field.fieldType === 'property' ? 'properties'
        : field.fieldType === 'project' ? 'projects'
        : field.fieldType === 'relation' ? (field.relationTable || 'entities')
        : 'entities';
      const targetNameCol = field.fieldType === 'relation'
        ? (field.relationDisplayColumn || 'name')
        : targetTable === 'properties' ? 'street_address' : 'name';
      const insertData: any = targetTable === 'entities'
        ? { company_id: companyId, [targetNameCol]: newName, entity_type: 'Person' }
        : targetTable === 'properties'
        ? { company_id: companyId, [targetNameCol]: newName }
        : { company_id: companyId, name: newName, status: 'active', created_by: (await supabase.auth.getUser()).data.user?.id };
      const { data: created, error: createError } = await supabase.from(targetTable).insert(insertData).select('id').single();
      if (createError || !created) {
        window.alert(createError?.message || `Couldn't create "${newName}"`);
        return;
      }
      resolvedId = created.id;
      resolvedName = newName;
    }
    const resolvedItem = { id: resolvedId, name: resolvedName };

    // Junction-backed base relation fields (e.g. property_id) — insert a link row
    if (field.field_source === 'base' && field.fieldType === 'relation' && field.relationJunction) {
      const { table: junctionTable, sourceCol, targetCol } = field.relationJunction;
      const { error } = await supabase.from(junctionTable).insert({
        company_id: companyId, [sourceCol]: recordId, [targetCol]: resolvedId,
      });
      if (error) { window.alert(error.message); return; }
      setLinkedItems(prev => ({ ...prev, [field.field_key]: [...(prev[field.field_key] || []), resolvedItem] }));
      return;
    }

    // Base relation fields — save UUID directly to the record column
    if (field.field_source === 'base' && field.fieldType === 'relation') {
      const { error } = await supabase.from(systemTable!).update({ [field.field_key]: resolvedId }).eq('id', recordId);
      if (error) { window.alert(error.message); return; }
      setRecord(prev => prev ? { ...prev, [field.field_key]: resolvedId } : prev);
      setLinkedItems(prev => ({ ...prev, [field.field_key]: [resolvedItem] }));
      return;
    }

    // Person link fields — store the display name as text
    if (field.field_source === 'base' && field.fieldType === 'person_link') {
      const { error } = await supabase.from(systemTable!).update({ [field.field_key]: resolvedName }).eq('id', recordId);
      if (error) { window.alert(error.message); return; }
      setRecord(prev => prev ? { ...prev, [field.field_key]: resolvedName } : prev);
      setLinkedItems(prev => ({ ...prev, [field.field_key]: [resolvedItem] }));
      return;
    }

    // Canonical storage for entity/property/project custom-field values --
    // matches every other writer in this app (Teams bot, invoices,
    // precedents, the Gmail add-on). A record can only have one value per
    // field here (single value_record_id column, not an array), so update
    // the existing row if one exists rather than inserting a duplicate.
    const { data: existingRow } = await supabase
      .from('company_custom_field_values')
      .select('id')
      .eq('record_id', recordId).eq('field_id', fieldId)
      .maybeSingle();
    const { error } = existingRow
      ? await supabase.from('company_custom_field_values').update({ value_record_id: resolvedId }).eq('id', existingRow.id)
      : await supabase.from('company_custom_field_values').insert({
          company_id: companyId,
          field_id: fieldId,
          record_id: recordId,
          table_name: systemTable || '',
          value_record_id: resolvedId,
        });
    if (error) { window.alert(error.message); return; }

    // Update local state
    setLinkedItems(prev => ({
      ...prev,
      [fieldId]: [resolvedItem],
    }));
  };

  const handleRemoveLinked = async (fieldId: string, linkedRecordId: string) => {
    // See handleAddLinked's identical guard -- trust_link isn't in `fields`
    // state, so the lookup below would never match it.
    if (systemTable === 'entities' && fieldId === 'trust_link') {
      const { data: existing } = await supabase.from('entity_relationships')
        .select('id').eq('child_entity_id', recordId).eq('relationship_type', 'Trustee').maybeSingle();
      if (existing) await supabase.from('entity_relationships').delete().eq('id', existing.id);
      setLinkedItems(prev => ({ ...prev, trust_link: [] }));
      invalidateEntityRelationCache();
      return;
    }

    const field = fields.find(f => f.id === fieldId || f.field_key === fieldId);

    if (field?.field_source === 'base' && field.fieldType === 'relation' && field.relationJunction) {
      const { table: junctionTable, sourceCol, targetCol } = field.relationJunction;
      const { error } = await supabase.from(junctionTable).delete().eq(sourceCol, recordId).eq(targetCol, linkedRecordId);
      if (error) { window.alert(error.message); return; }
      setLinkedItems(prev => ({
        ...prev,
        [fieldId]: (prev[fieldId] || []).filter(i => i.id !== linkedRecordId),
      }));
      return;
    }

    if (field?.field_source === 'base' && field.fieldType === 'relation') {
      const { error } = await supabase.from(systemTable!).update({ [field.field_key]: null }).eq('id', recordId);
      if (error) { window.alert(error.message); return; }
      setRecord(prev => prev ? { ...prev, [field.field_key]: null } : prev);
      setLinkedItems(prev => ({ ...prev, [fieldId]: [] }));
      return;
    }

    const { error } = await supabase.from('company_custom_field_values')
      .delete()
      .eq('field_id', fieldId)
      .eq('record_id', recordId);
    if (error) { window.alert(error.message); return; }

    setLinkedItems(prev => ({
      ...prev,
      [fieldId]: (prev[fieldId] || []).filter(i => i.id !== linkedRecordId),
    }));
  };

  const handleFieldSave = async (fieldKey: string, value: any) => {
  if (!record) return;

  if (systemTable) {
    const field = fields.find(f => f.field_key === fieldKey || f.id === fieldKey);
    const isCustom = field?.field_source === 'custom';

    if (isCustom && field) {
      let saveValue = value;

      // ── Linked fields (entity/property) handled separately via handleAddLinked/handleRemoveLinked
      // This branch handles non-linked custom fields only
      if (['entity', 'property'].includes(field.fieldType)) return;

      // Save to custom_field_values
      const fieldType = field.fieldType;
      const valueCol =
        ['number', 'currency'].includes(fieldType) ? 'value_number'
        : fieldType === 'date' ? 'value_date'
        : fieldType === 'boolean' ? 'value_boolean'
        : 'value_text';

      await supabase.from('company_custom_field_values').upsert({
        company_id: companyId,
        field_id: field.id,
        record_id: recordId,
        table_name: systemTable,
        [valueCol]: saveValue,
      }, { onConflict: 'field_id,record_id' });

      setRecord(prev => prev ? { ...prev, [field.id]: saveValue } : prev);

    } else if (systemTable === 'entities' && fieldKey === 'entity_type' && Array.isArray(value)) {
      // The "Entity Type" field edits entities.roles directly (multi-select
      // -- see the isEntityTypeRoles override above); entity_type itself is
      // kept as roles[0] so every other consumer that still reads the
      // single entity_type column (staff auto-provisioning, CSV import,
      // Xero, invoice modal, ...) keeps seeing a sensible primary value.
      const roles = value as string[];
      await supabase.from('entities').update({ roles, entity_type: roles[0] || null }).eq('id', recordId);
      setRecord(prev => prev ? { ...prev, roles, entity_type: roles[0] || null } : prev);
      invalidateEntityRelationCache();
    } else {
      // Base column
      await supabase
        .from(systemTable)
        .update({ [fieldKey]: value || null })
        .eq('id', recordId);
      setRecord(prev => prev ? { ...prev, [fieldKey]: value } : prev);
      if (systemTable === 'entities') invalidateEntityRelationCache();
    }

  } else if (tableId) {
    await supabase.from('company_table_values').upsert({
      company_id: companyId,
      table_id: tableId,
      record_id: recordId,
      field_id: fieldKey,
      value_text: value,
    }, { onConflict: 'record_id,field_id' });
    setRecord(prev => prev ? { ...prev, [fieldKey]: value } : prev);
  }
};
  // ── Field layout ───────────────────────────────────────────────

  const getTabFieldLayout = (tabId: string): FieldLayout[] => {
    const saved = tabFieldLayouts[tabId];
    if (saved && saved.length > 0) {
      return saved.map(s => {
        const meta = fields.find(f => f.field_key === s.field_key);
        return { ...s, ...meta, col_span: s.col_span, row_order: s.row_order };
      });
    }
    return fields;
  };

  // Backs FieldAutoNumberPopover's inline toggle (see FieldLayoutEditor.tsx)
  // -- a schema-level change (company-wide, not just this record), so it
  // writes to company_custom_fields (system tables) or company_table_fields
  // (custom tables), same tables/columns FieldConfigPanel.tsx's full config
  // panel writes, just via the quicker inline path.
  const handleSaveAutoNumber = async (field: FieldLayout, next: AutoNumberConfigValue) => {
    const table = systemTable ? 'company_custom_fields' : 'company_table_fields';
    await supabase.from(table).update({
      auto_number_prefix: next.prefix, auto_number_start: next.start, auto_number_pad: next.pad,
    }).eq('id', field.id);
    setFields(prev => prev.map(f => f.id === field.id ? { ...f, autoNumber: next } : f));
  };

  const saveTabFieldLayout = async (tabId: string, layout: FieldLayout[]) => {
    const upserts = layout.map(f => ({
      tab_id: tabId,
      field_key: f.field_key,
      field_source: f.field_source,
      col_start: f.col_start,
      col_span: f.col_span,
      row_order: f.row_order,
    }));
    await supabase
      .from('record_tab_fields')
      .upsert(upserts, { onConflict: 'tab_id,field_key' });
    setTabFieldLayouts(prev => ({ ...prev, [tabId]: layout }));
  };

  const handleLayoutChange = (tabId: string, layout: FieldLayout[]) => {
    setTabFieldLayouts(prev => ({ ...prev, [tabId]: layout }));
  };

  // AI-driven field grouping (see app/api/ai/classify-field-sections) --
  // scoped per (companyId, recordTable), NOT per record. Every record of a
  // table shares the same field set, so this only needs to run once per
  // company per table ever (until a field is added that isn't covered
  // yet), instead of once per individual record a user happens to open --
  // that per-record version was the earlier design and is why it used to
  // take a long time: every new record re-ran the AI call from scratch.
  //
  // fieldSectionsLoaded distinguishes "still loading" from "loaded, and
  // genuinely nothing there yet" -- without it, the classify effect below
  // would fire on the empty map during the initial fetch and re-run even
  // for already-classified companies.
  const [fieldSections, setFieldSections] = useState<Record<string, string>>({});
  const [fieldSectionsLoaded, setFieldSectionsLoaded] = useState(false);
  const [classifyFailed, setClassifyFailed] = useState(false);
  const classifyingRef = useRef(false);

  useEffect(() => {
    if (!companyId || !recordTable) return;
    let cancelled = false;
    setFieldSectionsLoaded(false);
    supabase
      .from('company_table_field_sections')
      .select('field_key, section')
      .eq('company_id', companyId)
      .eq('table_name', recordTable)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        (data || []).forEach((r: { field_key: string; section: string }) => { map[r.field_key] = r.section; });
        setFieldSections(map);
        setFieldSectionsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [companyId, recordTable]);

  const classifyFieldSections = async () => {
    if (classifyingRef.current) return;
    classifyingRef.current = true;
    try {
      const res = await fetch('/api/ai/classify-field-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: recordTable,
          fields: fields.map(f => ({ field_key: f.field_key, label: f.label })),
        }),
      });
      if (!res.ok) { setClassifyFailed(true); return; }
      const { sections } = await res.json();
      setFieldSections(prev => ({ ...prev, ...sections }));
    } catch {
      setClassifyFailed(true);
    } finally {
      classifyingRef.current = false;
    }
  };

  useEffect(() => {
    if (!fieldSectionsLoaded || classifyFailed || fields.length === 0) return;
    if (fields.some(f => !fieldSections[f.field_key])) classifyFieldSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSectionsLoaded, fields, fieldSections, classifyFailed]);

  const handleRemoveFieldFromTab = async (tabId: string, fieldKey: string) => {
    await supabase
      .from('record_tab_fields')
      .delete()
      .eq('tab_id', tabId)
      .eq('field_key', fieldKey);
    setTabFieldLayouts(prev => ({
      ...prev,
      [tabId]: (prev[tabId] || []).filter(f => f.field_key !== fieldKey),
    }));
  };

  const handleAddFieldToTab = (tabId: string) => {
    setFieldPickerTabId(tabId);
    setShowFieldPicker(true);
  };

  const handlePickField = async (fieldKey: string) => {
    if (!fieldPickerTabId) return;
    const currentLayout = tabFieldLayouts[fieldPickerTabId] || fields;
    const usedKeys = new Set(currentLayout.map(f => f.field_key));
    if (usedKeys.has(fieldKey)) return;
    const field = fields.find(f => f.field_key === fieldKey);
    if (!field) return;
    const newLayout = [
      ...currentLayout,
      { ...field, col_span: 6, row_order: currentLayout.length },
    ];
    await saveTabFieldLayout(fieldPickerTabId, newLayout);
    setShowFieldPicker(false);
    setFieldPickerTabId(null);
  };

  // ── Sub-project handlers ───────────────────────────────────────

  const handleSaveSubProject = async () => {
    const name = newSubProjectName.trim();
    if (!name) return;
    const { data: newSub } = await supabase
      .from('projects')
      .insert({
        company_id: companyId,
        parent_project_id: recordId,
        name,
      })
      .select('id, name')
      .single();
    if (newSub) {
      setSubProjects(prev => [...prev, newSub]);
      setActiveSubProjectId(newSub.id);
    }
    setIsAddingSubProject(false);
    setNewSubProjectName('');
  };

  const handleDiscardSubProject = () => {
    setIsAddingSubProject(false);
    setNewSubProjectName('');
  };

  // ── Delete ─────────────────────────────────────────────────────

  const handleDelete = async () => {
    const label = record ? (record.name || record.street_address || fallbackLabelValue || 'this record') : 'this record';

    if (!isAdmin) {
      if (!window.confirm(`Request archiving "${label}"? A company admin will need to approve it.`)) return;
      if (!companyId) return;
      const entityTable = systemTable || 'company_table_records';
      const result = await createArchiveRequest(entityTable as ArchiveEntityTable, recordId, label, companyId);
      if (!result.ok) { alert(result.error); return; }
      setHasPendingArchiveRequest(true);
      alert(result.alreadyPending ? "Already requested, waiting on admin review." : "Archive requested, a company admin will review it.");
      return;
    }

    if (!window.confirm('Archive this record?')) return;
    if (systemTable) {
      await supabase
        .from(systemTable)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', recordId);
    } else if (tableId) {
      await supabase
        .from('company_table_records')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', recordId);
    }
    onBack();
  };

  useEffect(() => {
    if (record && fields.length > 0) {
      resolveLinkedItems();
    }
  }, [record, fields]);

  useProgressBarWhile(loading);

  // ── Derived ────────────────────────────────────────────────────

  const primaryValue = record
    ? systemTable === 'properties'
      ? record.street_address
      : record.name || fallbackLabelValue || 'Untitled'
    : 'Loading...';

  const RECORD_TYPE_ICON: Record<string, typeof Table2> = {
    projects: LayoutGrid,
    properties: MapPin,
    entities: Building2,
    tasks: CheckSquare,
  };
  const RecordTypeIcon = (systemTable && RECORD_TYPE_ICON[systemTable]) || Table2;

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Data-grid tabs (Time & Fees/Disbursements and any other custom_dashboard,
  // plus Invoices) need much more horizontal room than a field-list tab --
  // the shared max-w-4xl wrapper below was clipping grid columns on every
  // one of them. Everything else stays at the narrower, more readable width.
  const isGridTab = activeTab?.tab_type === 'custom_dashboard' || activeTab?.tab_type === 'invoice_dashboard';
  const tabContentMaxWidthClass = isGridTab ? 'max-w-[1600px]' : 'max-w-4xl';

  // ── Shared tab content renderer ────────────────────────────────

  // "Trust" rides alongside "Entity Type" in the same field grid/section
  // (not a separate block below it) -- a synthetic field, same trick
  // entity_type itself uses to edit entities.roles, except this one
  // ('base' + 'relation', no relationJunction) goes through the ordinary
  // linkedItems/onAddLinked/onRemoveLinked machinery every other relation
  // field here already uses, special-cased to write entity_relationships
  // instead of a real column (see handleAddLinked/handleRemoveLinked).
  // Only injected when the entity actually holds a trustee role, and only
  // once (skipped if a saved layout already has it from a prior session).
  const withTrustField = (list: FieldLayout[]): FieldLayout[] => {
    if (systemTable !== 'entities' || !record?.roles?.some((r: string) => TRUSTEE_ROLE_TYPES.includes(r))) return list;
    if (list.some(f => f.field_key === 'trust_link')) return list;
    const anchor = list.find(f => f.field_key === 'entity_type');
    return [...list, {
      id: 'trust_link', field_key: 'trust_link', field_source: 'base' as const, label: 'Trust',
      fieldType: 'relation', relationTable: 'entities', relationDisplayColumn: 'name',
      col_start: 1, col_span: anchor?.col_span ?? 6, row_order: anchor ? anchor.row_order + 0.5 : list.length,
    }];
  };
  const fieldSectionsWithTrust = systemTable === 'entities' && fieldSections['entity_type']
    ? { ...fieldSections, trust_link: fieldSections['entity_type'] }
    : fieldSections;

  // One visited tab's content -- pulled out of renderTabContent so it can
  // be called once per VISITED tab (not just the active one) below, keyed
  // off that tab specifically rather than the activeTab closure.
  const renderTabFor = (tab: RecordTab) => {
    switch (tab.tab_type) {
      case 'fields':
        return (
          <FieldLayoutEditor
            fieldSections={fieldSectionsWithTrust}
            fields={withTrustField(getTabFieldLayout(tab.id))}
            recordValues={systemTable === 'entities' && record ? { ...record, entity_type: record.roles ?? [] } : record || {}}
            linkedItems={linkedItems}
            isEditing={tab.id === activeTabId && isEditingLayout}
            onSave={handleFieldSave}
            onAddLinked={handleAddLinked}
            onRemoveLinked={handleRemoveLinked}
            onLayoutChange={layout => {
              handleLayoutChange(tab.id, layout);
              saveTabFieldLayout(tab.id, layout);
            }}
            onAddField={() => handleAddFieldToTab(tab.id)}
            onRemoveField={fieldKey =>
              handleRemoveFieldFromTab(tab.id, fieldKey)
            }
            onSaveAutoNumber={isAdmin ? handleSaveAutoNumber : undefined}
            autoNumberParentTable={systemTable ? { kind: 'system', table: systemTable } : { kind: 'custom', tableId: tableId! }}
          />
        );
      case 'sub_projects':
        return <SubProjectsTab recordId={recordId} />;
      case 'related_matters':
        return <RelatedMattersTab recordId={recordId} />;
      case 'checklist':
        return <ChecklistTab recordId={recordId} companyId={companyId} />;
      case 'calendar':
        return <CalendarTab recordId={recordId} />;
      case 'emails':
        return <EmailsTab recordId={recordId} />;
      case 'document_templates':
        return <DocumentTemplatesTab recordId={recordId} companyId={companyId} />;
      case 'precedents':
        return <PrecedentsTab recordId={recordId} companyId={companyId} initialPrecedentId={initialPrecedentId} />;
      case 'custom_dashboard':
        return tab.linked_table_id ? (
          <RecordDashboardTab
            tabId={tab.id}
            linkedTableId={tab.linked_table_id}
            recordId={recordId}
            companyId={companyId}
            isEditing={tab.id === activeTabId && isEditingLayout}
            // Tasks aren't a relation *target* other tables link back to (no
            // 'task' field type exists), unlike properties/entities/projects
            // -- so there's no ParentSystemTable value for it; leave the
            // auto-detection unset for a task record, same as a custom-table-
            // backed one (computeRelationCandidates already handles "unknown
            // parent" by falling back to the broad candidate set).
            recordSystemTable={systemTable !== 'tasks' ? systemTable : undefined}
          />
        ) : null;
      case 'invoice_dashboard':
        return tab.linked_table_id ? (
          <InvoicesTab
            linkedTableId={tab.linked_table_id}
            recordId={recordId}
            companyId={companyId}
          />
        ) : null;
      case 'finance_model':
        return <FinanceModelTab recordId={recordId} />;
      case 'trust_account':
        return <TrustAccountTab recordId={recordId} companyId={companyId} userId={ctxUserId!} isAdmin={isAdmin} />;
      case 'residual_land_solver':
        return <ResidualLandSolverTab recordId={recordId} isProject={systemTable === 'projects'} />;
      default:
        return null;
    }
  };

  const renderTabContent = () => (
    <>
      {tabs.filter(t => visitedTabIds.has(t.id)).map(t => (
        <div key={t.id} className={t.id === activeTabId ? '' : 'hidden'}>
          {renderTabFor(t)}
        </div>
      ))}
      {activeTabId === '__access__' && systemTable === 'projects' && (
        <ProjectAccessPanel
          projectId={recordId}
          companyId={companyId}
          isAdmin={isAdmin}
        />
      )}
      {activeTabId === '__admin__' && systemTable === 'projects' && (
        <ProjectDeletedTasksPanel projectId={recordId} />
      )}

      {!activeTab && tabs.length === 0 && !tabsLoaded && (
        <div className="space-y-6 animate-pulse">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="grid grid-cols-6 gap-4 items-center">
              <div className="col-span-2 h-3 bg-slate-100 rounded-full" />
              <div className="col-span-4 h-9 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {!activeTab && tabs.length === 0 && tabsLoaded && (
        <div
          className="flex flex-col items-center justify-center py-20 gap-4 cursor-pointer"
          onClick={() => setShowAddTab(true)}
        >
          <p className="text-slate-300 text-[11px] font-bold uppercase tracking-widest">
            No tabs yet
          </p>
          <button className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-[11px] font-bold">
            Add first tab
          </button>
        </div>
      )}
    </>
  );

  // ── Shared modals ──────────────────────────────────────────────

  const renderModals = () => (
    <>
      {showAddTab && (
        <AddTabModal
          customTables={customTables.filter(t => !TRUST_PAGE_MANAGED_SLUGS.has(t.slug))}
          systemTable={systemTable}
          onAdd={handleAddTab}
          onClose={() => setShowAddTab(false)}
        />
      )}

      {showFieldPicker && fieldPickerTabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-slate-900">
                Add field
              </h3>
              <button
                onClick={() => {
                  setShowFieldPicker(false);
                  setFieldPickerTabId(null);
                }}
                className="p-2 text-slate-300 hover:text-black"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {fields
                .filter(f => {
                  const used = new Set(
                    (tabFieldLayouts[fieldPickerTabId] || fields).map(l => l.field_key)
                  );
                  return !used.has(f.field_key);
                })
                .map(field => (
                  <button
                    key={field.field_key}
                    onClick={() => handlePickField(field.field_key)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-700">
                        {field.label}
                      </p>
                      <p className="text-[10px] text-slate-400">{field.fieldType}</p>
                    </div>
                  </button>
                ))
              }
              {fields.filter(f => {
                const used = new Set(
                  (tabFieldLayouts[fieldPickerTabId] || fields).map(l => l.field_key)
                );
                return !used.has(f.field_key);
              }).length === 0 && (
                <p className="text-center text-[11px] text-slate-300 italic py-6">
                  All fields already added
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Early returns ──────────────────────────────────────────────

  if (loading) {
    // Mirrors the shape of the real header + TabBar below (rather than a
    // bare spinner) so the tab row doesn't pop into existence once data
    // arrives — same intent as GenericMasterTable's row skeleton.
    const tabSkeleton = (
      <div className="flex items-center gap-1 border-b border-slate-100 px-6 -mx-8 bg-white animate-pulse">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2 px-4 py-3.5">
            <div className="h-3.5 w-3.5 rounded bg-slate-100" />
            <div className="h-2.5 w-14 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );

    if (embedded) {
      return (
        <div className="font-sans antialiased">
          <div className="px-8 pt-6 pb-0 border-b border-slate-100 bg-white">
            <div className="animate-pulse h-6 w-56 rounded bg-slate-100 mb-3" />
            <div className="animate-pulse h-2.5 w-28 rounded bg-slate-100 mb-3" />
            {tabSkeleton}
          </div>
          <div className="p-8 bg-[#F9FAFB]">
            <div className="max-w-4xl mx-auto space-y-3 animate-pulse">
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-5/6 rounded bg-slate-100" />
              <div className="h-4 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-screen bg-white font-sans antialiased overflow-hidden">
        {/* pt-16 on mobile -- Sidebar.tsx's hamburger toggle is a fixed
            top-3 left-3 button (md:hidden), floating outside this header's
            own layout; without the extra clearance it visually overlaps
            the content below instead of sitting above it. */}
        <header className="px-8 pt-16 md:pt-6 pb-0 border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center justify-between mb-4 animate-pulse">
            <div className="h-6 w-20 rounded-full bg-slate-100" />
            <div className="h-8 w-8 rounded-full bg-slate-100" />
          </div>
          <div className="animate-pulse h-8 w-72 rounded bg-slate-100 mb-2" />
          <div className="animate-pulse h-2.5 w-32 rounded bg-slate-100 mb-4" />
          {tabSkeleton}
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-[#F9FAFB]">
          <div className="max-w-4xl mx-auto space-y-3 animate-pulse">
            <div className="h-4 w-full rounded bg-slate-100" />
            <div className="h-4 w-5/6 rounded bg-slate-100" />
            <div className="h-4 w-2/3 rounded bg-slate-100" />
            <div className="h-4 w-1/2 rounded bg-slate-100" />
          </div>
        </main>
      </div>
    );
  }

  if (!record) return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <AlertCircle size={32} className="text-slate-300" />
      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
        Record not found
      </p>
      <button
        onClick={onBack}
        className="text-indigo-600 text-[11px] font-bold hover:underline"
      >
        Go back
      </button>
    </div>
  );

  // ── Embedded view ──────────────────────────────────────────────

  if (embedded) {
    return (
      <div className="font-sans antialiased">
        <div className="px-8 pt-6 pb-0 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight truncate">
              {primaryValue}
            </h2>
            <div className="flex items-center gap-2">
              {(activeTab?.tab_type === 'fields' || activeTab?.tab_type === 'custom_dashboard') && (
                <button
                  onClick={() => setIsEditingLayout(p => !p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    isEditingLayout
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-600'
                  }`}
                >
                  <Pencil size={12} />
                  {isEditingLayout ? 'Done' : 'Edit layout'}
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mb-3">
            {tableName || systemTable}
            {record.created_at && (
              <span className="ml-2">
                · {new Date(record.created_at).toLocaleDateString('en-AU')}
              </span>
            )}
          </p>
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTabId}
            onAdd={() => setShowAddTab(true)}
            onRename={handleRenameTab}
            onDelete={handleDeleteTab}
            onReorder={handleReorderTabs}
            isEditing={isEditingTabs}
            onToggleEdit={() => setIsEditingTabs(p => !p)}
          />
        </div>
        <div className="p-8 bg-[#F9FAFB]">
          <div className={`${tabContentMaxWidthClass} mx-auto`}>
            {renderTabContent()}
          </div>
        </div>
        {renderModals()}
      </div>
    );
  }

  // ── Full view ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-white font-sans antialiased overflow-hidden">

      {/* ── Header ── */}
      {/* pt-16 on mobile -- Sidebar.tsx's hamburger toggle is a fixed
          top-3 left-3 button (md:hidden), floating outside this header's
          own layout; without the extra clearance it visually overlaps
          the content below instead of sitting above it. */}
      <header className="px-8 pt-16 md:pt-7 pb-0 border-b border-slate-100 shrink-0 bg-white">

        {/* Title + actions */}
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <RecordTypeIcon size={14} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight truncate">
              {primaryValue}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(activeTab?.tab_type === 'fields' || activeTab?.tab_type === 'custom_dashboard') && (
              <button
                onClick={() => setIsEditingLayout(p => !p)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  isEditingLayout
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
              >
                <Pencil size={12} />
                {isEditingLayout ? 'Done' : 'Edit layout'}
              </button>
            )}
            {hasPendingArchiveRequest && (
              <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase bg-amber-50 text-amber-600">
                Archive requested
              </span>
            )}
            <button
              onClick={handleDelete}
              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <p className="text-[11px] font-medium text-slate-400 mb-4">
          {tableName || systemTable}
          {record.created_at && (
            <span className="ml-2">
              · {new Date(record.created_at).toLocaleDateString('en-AU')}
            </span>
          )}
        </p>

        {/* Send SMS — entities only */}
        {systemTable === 'entities' && (
          <SendSmsCard
            entityId={recordId}
            entityName={record.name || ''}
            phoneNumber={record.mobile_phone || record.phone || null}
          />
        )}

        {/* Sub-projects row — projects only */}
        {systemTable === 'projects' && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest shrink-0">
              Sub-projects
            </span>

            {subProjects.map(sp => {
              const displayName = sp.name.includes('/')
                ? sp.name.split('/').slice(-1)[0].trim()
                : sp.name;
              const isActive = activeSubProjectId === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => setActiveSubProjectId(isActive ? null : sp.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  <FolderKanban size={12} />
                  {displayName}
                </button>
              );
            })}

            {isAddingSubProject ? (
              <span className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg bg-white border border-indigo-300">
                <FolderKanban size={12} className="text-slate-300 shrink-0" />
                <input
                  autoFocus
                  value={newSubProjectName}
                  onChange={e => setNewSubProjectName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveSubProject();
                    if (e.key === 'Escape') handleDiscardSubProject();
                  }}
                  placeholder="Sub-project name"
                  className="text-[11px] font-bold text-slate-700 outline-none w-32 bg-transparent placeholder:font-medium placeholder:text-slate-300"
                />
                <button
                  onClick={handleSaveSubProject}
                  disabled={!newSubProjectName.trim()}
                  title="Save"
                  className="p-1 rounded-md text-emerald-500 hover:bg-emerald-50 disabled:opacity-30 disabled:hover:bg-transparent shrink-0 transition-all"
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={handleDiscardSubProject}
                  title="Discard"
                  className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0 transition-all"
                >
                  <X size={13} />
                </button>
              </span>
            ) : (
              <button
                onClick={() => setIsAddingSubProject(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-indigo-600 border border-dashed border-slate-200 hover:border-indigo-300 transition-all"
              >
                <Plus size={12} /> Add sub-project
              </button>
            )}
          </div>
        )}

        {/* Tab bar */}
        <TabBar
          tabs={tabs}
          activeTabId={(activeTabId === '__access__' || activeTabId === '__admin__') ? null : activeTabId}
          onSelect={setActiveTabId}
          onAdd={() => setShowAddTab(true)}
          onRename={handleRenameTab}
          onDelete={handleDeleteTab}
          onReorder={handleReorderTabs}
          isEditing={isEditingTabs}
          onToggleEdit={() => setIsEditingTabs(p => !p)}
          extraTabs={systemTable === 'projects' && isAdmin ? [
            { id: '__access__', label: 'Access', icon: ShieldCheck },
            { id: '__admin__', label: 'Admin', icon: Trash2 },
          ] : []}
          onSelectExtra={setActiveTabId}
        />
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden bg-[#F9FAFB] relative min-h-0">
        <div
          ref={splitContainerRef}
          className={`h-full min-h-0 flex ${
            activeSubProjectId && !subProjectFullscreen && subProjectOrientation === 'side' ? 'flex-row' : 'flex-col'
          }`}
        >
          {/* Parent record content -- hidden (not unmounted) rather than
              removed when the sub-project goes fullscreen, so scroll
              position and any in-progress edits survive going back. */}
          <div
            className={`flex-1 min-w-0 min-h-0 overflow-y-auto p-8 ${
              activeSubProjectId && subProjectFullscreen ? 'hidden' : ''
            }`}
          >
            <div className={`${tabContentMaxWidthClass} mx-auto`}>
              {renderTabContent()}
            </div>
          </div>

          {/* Divider -- drags subProjectRatio via direct style mutation
              (see the mousemove handler above) so dragging stays smooth
              even though the sub-project pane renders a whole nested
              RecordDashboard. */}
          {activeSubProjectId && !subProjectFullscreen && (
            <div
              onMouseDown={startSubProjectDrag}
              className={`shrink-0 bg-indigo-50/80 hover:bg-indigo-100 transition-colors group flex items-center justify-center ${
                subProjectOrientation === 'side' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
              }`}
            >
              <div className={`bg-indigo-300 rounded-full group-hover:bg-indigo-500 transition-colors ${
                subProjectOrientation === 'side' ? 'w-0.5 h-10' : 'h-0.5 w-10'
              }`} />
            </div>
          )}

          {/* Sub-project pane */}
          {activeSubProjectId && (
            <div
              ref={subProjectPaneRef}
              className={`flex flex-col bg-white shrink-0 min-w-0 min-h-0 ${
                subProjectFullscreen
                  ? 'absolute inset-0 z-40'
                  : subProjectOrientation === 'side' ? 'border-l-2 border-indigo-100' : 'border-t-2 border-indigo-100'
              }`}
              style={!subProjectFullscreen ? { flexBasis: `${subProjectRatio * 100}%` } : undefined}
            >
              {/* Toolbar */}
              <div className="h-10 flex items-center gap-1 px-3 border-b border-indigo-100 bg-indigo-50/60 shrink-0">
                <FolderKanban size={12} className="text-indigo-500 shrink-0" />
                <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mr-auto truncate">
                  Sub-project
                </p>
                {!subProjectFullscreen && (
                  <>
                    <button
                      onClick={() => setSubProjectOrientation('side')}
                      title="Share the screen side by side"
                      className={`p-1.5 rounded-lg transition-colors ${
                        subProjectOrientation === 'side' ? 'bg-indigo-500 text-white' : 'text-indigo-400 hover:bg-indigo-100'
                      }`}
                    >
                      <Columns2 size={13} />
                    </button>
                    <button
                      onClick={() => setSubProjectOrientation('stack')}
                      title="Share the screen top and bottom"
                      className={`p-1.5 rounded-lg transition-colors ${
                        subProjectOrientation === 'stack' ? 'bg-indigo-500 text-white' : 'text-indigo-400 hover:bg-indigo-100'
                      }`}
                    >
                      <Rows2 size={13} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSubProjectFullscreen(p => !p)}
                  title={subProjectFullscreen ? 'Back to split view' : 'Fullscreen'}
                  className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-100 transition-colors"
                >
                  {subProjectFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button
                  onClick={() => { setActiveSubProjectId(null); setSubProjectFullscreen(false); }}
                  title="Close"
                  className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-100 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                <RecordDashboard
                  key={activeSubProjectId}
                  systemTable="projects"
                  recordId={activeSubProjectId}
                  onBack={() => { setActiveSubProjectId(null); setSubProjectFullscreen(false); }}
                  embedded={true}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {renderModals()}
    </div>
  );
}