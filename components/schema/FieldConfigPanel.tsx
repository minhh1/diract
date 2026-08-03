"use client";

import { useState, useEffect } from "react";
import { X, Check, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import type { CustomField, FieldType } from "./types";
import { getFieldTypeConfig } from "./types"
import { RELATION_FIELD_TYPES, NUMERIC_FIELD_TYPES } from "@/lib/schema/fieldCapabilities";
import { validateFieldCompatibility } from "@/lib/schema/fieldCompatibilityRules";
import { fetchHighestAssignedNumber, type AutoNumberParentTable } from "@/lib/schema/autoNumberPresets";
import AutoNumberConfig from "./AutoNumberConfig";

const RELATION_TYPES: FieldType[] = RELATION_FIELD_TYPES;

// Native, text-ish columns worth offering as extra search fields or a
// restrict-to filter for a relation linked to a system table (see
// lib/columnDefinitions.ts for the full column lists -- these are the
// subset that make sense to ilike/eq against from a picker).
// acn/abn used to be here too -- they're company_custom_fields now (see
// supabase/migrations/20260729290000_entities_finance_fields_to_custom.sql),
// and this relation-picker search only covers native columns.
// folio_identifier used to be here too -- it's a company_custom_field now
// (see supabase/migrations/20260730100000_property_folio_identifier_to_custom.sql),
// and this relation-picker search only covers native columns.
const SEARCH_COLUMNS: Record<string, string[]> = {
  properties: ['street_address', 'suburb', 'postcode'],
  entities: ['name', 'entity_type'],
  projects: ['name', 'description'],
};
const FILTER_COLUMNS: Record<string, string[]> = {
  properties: ['is_sold'],
  entities: ['entity_type', 'linked_profile_id'],
  projects: [],
};
// A "Sum of related" field on a system table needs the child (custom)
// table's own relation field to be typed for THIS specific system table --
// unlike a custom-table parent, which uses 'table_relation' generically.
const SYSTEM_RELATION_FIELD_TYPE: Record<string, FieldType> = { projects: 'project', entities: 'entity', properties: 'property' };
// Sentinel linked_filter_value for linked_profile_id -- resolved to the
// actual signed-in user's id at query time in RelationPicker (there's no
// meaningful static value an admin could type in for "whoever is signed
// in"). Also drives RelationPicker's auto-select: since this filter can
// only ever match zero or one row (an entity's linked_profile_id is the
// current user's own), it's picked automatically instead of making the
// user search for themselves.
const CURRENT_USER_SENTINEL = '$current_user';
// Role/team-aware sibling of CURRENT_USER_SENTINEL -- see lib/teamScope.ts.
// Unlike $current_user (always exactly the signed-in user), this can
// resolve to many rows: a company admin sees everyone, a team leader sees
// their team(s), everyone else sees just themselves.
const TEAM_SCOPE_SENTINEL = '$team_scope';
// Mirrors components/NewEntityModal.tsx's ENTITY_TYPES -- offered as a
// convenience dropdown when filtering entities by entity_type (e.g. a
// "Staff" field restricted to entity_type = 'Staff').
const ENTITY_TYPE_VALUES = [
  'Company', 'Individual', 'Corporate Trustee', 'Non Corporate Trustee',
  'Discretionary Family Trust', 'Fixed Unit Trust',
  'Lawyer', 'Accountant', 'Mortgage Broker', 'Real Estate Agent',
  'Local Council', 'Bank', 'Staff', 'Other',
];

function prettifyColumn(col: string): string {
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// True if `fromFieldId` (transitively, via its own formula_field_a_id/b_id)
// depends on `targetFieldId` -- used to keep a field's Field A/B pickers
// from offering anything that would create a circular formula (e.g. A = 50%
// of B, B = 50% of A). The picker already excludes the field itself
// (direct self-reference); this catches indirect cycles through any chain
// length. computeFormulaFields (lib/services/customTableService.ts) can't
// infinite-loop on a cycle -- it's a single forward pass, not recursive --
// but it silently produces one-step-stale, order-dependent numbers, which
// is confusing enough to prevent at configuration time instead.
function dependsOnField(fromFieldId: string, targetFieldId: string, fields: CustomField[], visited: Set<string> = new Set()): boolean {
  if (visited.has(fromFieldId)) return false;
  visited.add(fromFieldId);
  const field = fields.find(f => f.id === fromFieldId);
  if (!field) return false;
  const deps = [field.formula_field_a_id, field.formula_field_b_id].filter((id): id is string => !!id);
  if (deps.includes(targetFieldId)) return true;
  return deps.some(depId => dependsOnField(depId, targetFieldId, fields, visited));
}

// Auto numbering preset list/detection/example logic lives in
// lib/schema/autoNumberPresets.ts, shared with
// components/dashboard/FieldAutoNumberPopover.tsx's inline Record Dashboard
// toggle so the two entry points can't drift.

interface Props {
  field: CustomField;
  siblingFields?: CustomField[];
  onSave: (updates: Partial<CustomField>) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  // Set (non-null) to disable Save and show why instead -- a non-admin has
  // no "request an edit" fallback the way delete has, so this fully blocks
  // Save for either "not a company admin" or "installed from a template".
  saveDisabledReason?: string | null;
  // Set (non-null) to fully disable Delete too, instead of leaving it to
  // onDelete's own admin-vs-archive-request branching -- only for a
  // template-sourced field, since that can never be deleted by anyone (no
  // approval flow could ever succeed, see supabase/migrations/
  // 20260803030000_lock_template_schema.sql), unlike a plain non-admin
  // click, which onDelete still turns into a real archive request.
  deleteDisabledReason?: string | null;
}

export default function FieldConfigPanel({ field, siblingFields = [], onSave, onDelete, onClose, saveDisabledReason, deleteDisabledReason }: Props) {
  const { tables: customTables } = useCustomTables();
  const [draft, setDraft] = useState<CustomField>({ ...field });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [selectOptionsText, setSelectOptionsText] = useState(
    field.select_options?.join('\n') || ''
  );
  const [customFieldOptions, setCustomFieldOptions] = useState<{ id: string; label: string }[]>([]);
  // Candidate fields on the linked CUSTOM table (as opposed to a system
  // table -- see customFieldOptions above) for the "Also show" second
  // display field, when this field links to another custom table.
  const [linkedTableFieldOptions, setLinkedTableFieldOptions] = useState<{ id: string; label: string }[]>([]);
  // "Sum of related" (formula_type 'sum_related') 3-level picker state --
  // which CHILD table to sum from, then (derived from it) which of that
  // table's own fields link back here and which are numeric. sumChildTableId
  // isn't itself a stored column -- it's only ever implied by
  // formula_relation_field_id -- so an existing rollup's child table is
  // looked up once below rather than carried on the field row.
  const [sumChildTableId, setSumChildTableId] = useState('');
  const [sumRelationFieldOptions, setSumRelationFieldOptions] = useState<{ id: string; label: string }[]>([]);
  const [sumNumericFieldOptions, setSumNumericFieldOptions] = useState<{ id: string; label: string }[]>([]);
  // Optional "Only where" filter -- every field on the child table is a
  // candidate (not just numeric/relation ones), since the filter can be
  // against a boolean (e.g. Billable), select, or any other field type.
  // field_type/select_options are kept alongside id/label so the value
  // input below can adapt (Yes/No toggle, dropdown, or plain text).
  const [sumConditionFieldOptions, setSumConditionFieldOptions] = useState<{ id: string; label: string; field_type: string; select_options: string[] | null }[]>([]);

  const update = (key: keyof CustomField, value: any) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  // Candidate custom fields (e.g. "Matter Number" on projects) that can be
  // added as an extra search field alongside the display field.
  useEffect(() => {
    const table = draft.linked_table;
    if (!table || !SEARCH_COLUMNS[table]) { setCustomFieldOptions([]); return; }
    let active = true;
    supabase
      .from('company_custom_fields')
      .select('id, label')
      .eq('table_name', table)
      .is('deleted_at', null)
      .order('display_order')
      .then(({ data }) => { if (active) setCustomFieldOptions(data || []); });
    return () => { active = false; };
  }, [draft.linked_table]);

  // Candidate fields for "Also show" when this field links to another
  // custom table (as opposed to a system table, handled by
  // customFieldOptions above) -- id here is the target field's field_key,
  // matching RelationPicker's displayField2 convention for a custom-table
  // target (see components/dashboard/RelationPicker.tsx).
  useEffect(() => {
    const tableId = draft.linked_table_id;
    if (!tableId) { setLinkedTableFieldOptions([]); return; }
    let active = true;
    supabase
      .from('company_table_fields')
      .select('field_key, label')
      .eq('table_id', tableId)
      .is('deleted_at', null)
      .order('display_order')
      .then(({ data }) => { if (active) setLinkedTableFieldOptions((data || []).map(f => ({ id: f.field_key, label: f.label }))); });
    return () => { active = false; };
  }, [draft.linked_table_id]);

  // Editing an existing sum_related/max_related field: sumChildTableId isn't
  // a stored column, only implied by formula_relation_field_id -- derive it
  // once so the "From table" dropdown below opens pre-selected.
  useEffect(() => {
    if ((draft.formula_type !== 'sum_related' && draft.formula_type !== 'max_related') || !draft.formula_relation_field_id || sumChildTableId) return;
    let active = true;
    supabase.from('company_table_fields').select('table_id').eq('id', draft.formula_relation_field_id).maybeSingle()
      .then(({ data }) => { if (active && data?.table_id) setSumChildTableId(data.table_id); });
    return () => { active = false; };
  }, [draft.formula_type, draft.formula_relation_field_id]);

  // Candidate relation/target fields on the chosen child table, for the
  // "Sum of related"/"Max of related" picker's 2nd/3rd levels -- a relation
  // field qualifies only if it actually points back at THIS table:
  // table_relation + matching linked_table_id for a custom-table parent, or
  // the fixed field_type this system table's own name implies (project/
  // entity/property) for a system-table parent (see SYSTEM_RELATION_FIELD_TYPE
  // below). Target-field candidates differ by aggregate: sum_related stays
  // numeric-only (a sum only makes sense there), while max_related also
  // offers fields matching THIS field's own type -- e.g. a date field
  // (max_related's original motivating case: "the latest end date among a
  // loan's Interest Only phases") can only take its max against another
  // date field, not a number.
  useEffect(() => {
    if (!sumChildTableId) { setSumRelationFieldOptions([]); setSumNumericFieldOptions([]); setSumConditionFieldOptions([]); return; }
    let active = true;
    const relationFieldType = draft.isCustomTable ? 'table_relation' : SYSTEM_RELATION_FIELD_TYPE[draft.table_name];
    supabase.from('company_table_fields').select('id, field_key, label, field_type, linked_table_id, select_options')
      .eq('table_id', sumChildTableId).is('deleted_at', null).order('display_order')
      .then(({ data }) => {
        if (!active || !data) return;
        const relCandidates = data.filter(f =>
          f.field_type === relationFieldType && (draft.isCustomTable ? f.linked_table_id === draft.table_id : true)
        );
        const targetCandidates = data.filter(f =>
          draft.formula_type === 'max_related'
            ? f.field_type === draft.field_type
            : (NUMERIC_FIELD_TYPES as string[]).includes(f.field_type)
        );
        setSumRelationFieldOptions(relCandidates.map(f => ({ id: f.id, label: f.label })));
        setSumNumericFieldOptions(targetCandidates.map(f => ({ id: f.id, label: f.label })));
        setSumConditionFieldOptions(data.map(f => ({ id: f.id, label: f.label, field_type: f.field_type, select_options: f.select_options })));
      });
    return () => { active = false; };
  }, [sumChildTableId, draft.isCustomTable, draft.table_id, draft.table_name, draft.formula_type, draft.field_type]);

  const toggleSearchField = (key: string) => {
    const current = draft.linked_search_field_keys || [];
    update('linked_search_field_keys', current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
  };

  // Value table differs by which side of the isCustomTable divide this
  // field is on -- company_table_values (custom tables) vs
  // company_custom_field_values (system tables like projects/entities).
  // Excludes deleted/archived records (see fetchHighestAssignedNumber's own
  // doc comment) so a deleted matter's number can never get suggested as
  // "the latest" to continue from.
  const handleContinueFromLatest = async (): Promise<number | null> => {
    const valueTable = field.isCustomTable ? 'company_table_values' : 'company_custom_field_values';
    const parent: AutoNumberParentTable = field.isCustomTable
      ? { kind: 'custom', tableId: field.table_id! }
      : { kind: 'system', table: field.table_name };
    return fetchHighestAssignedNumber(draft.id, draft.auto_number_prefix || '', valueTable, parent);
  };

  const handleSave = async () => {
    const errors = validateFieldCompatibility(siblingFields, draft);
    if (errors.length) { setSaveErrors(errors); return; }
    setSaveErrors([]);
    setSaving(true);
    const updates = { ...draft };
    if (updates.field_type === 'select') {
      updates.select_options = selectOptionsText
        .split('\n').map(s => s.trim()).filter(Boolean);
    }
    await onSave(updates);
    setSaving(false);
  };

  const ftConfig = getFieldTypeConfig(draft.field_type);
  const FtIcon = ftConfig.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${ftConfig.color}`}>
            <FtIcon size={16} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800 truncate max-w-[140px]">
              {draft.label || 'Untitled field'}
            </p>
            <p className="text-[10px] text-slate-400 uppercase font-bold">{ftConfig.label}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Config form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Label */}
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Field label
          </label>
          <input
            value={draft.label}
            onChange={e => update('label', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Help text */}
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Help text
          </label>
          <input
            value={draft.help_text || ''}
            onChange={e => update('help_text', e.target.value || null)}
            placeholder="Shown below the field"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Section */}
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            Section / group
          </label>
          <input
            value={draft.section_name || ''}
            onChange={e => update('section_name', e.target.value || null)}
            placeholder="e.g. Financial details"
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Grid width — system tables only */}
        {!field.isCustomTable && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Width
            </label>
            <div className="flex gap-2">
              {[{ v: 1, l: 'Full' }, { v: 2, l: 'Half' }, { v: 3, l: 'Third' }].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => update('grid_width', opt.v)}
                  className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${
                    draft.grid_width === opt.v
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Select options */}
        {draft.field_type === 'select' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Options (one per line)
            </label>
            <textarea
              value={selectOptionsText}
              onChange={e => setSelectOptionsText(e.target.value)}
              rows={5}
              placeholder={"Option A\nOption B\nOption C"}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>
        )}

        {/* Relation config */}
        {RELATION_TYPES.includes(draft.field_type) && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Link to table
              </label>
              <select
                value={draft.linked_table || draft.linked_table_id || ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {  // ← HERE
                  const val = e.target.value;
                  const isSystem = ['properties', 'entities', 'projects'].includes(val);
                  if (isSystem) {
                    update('linked_table', val);
                    update('linked_table_id', null);
                    update('linked_display_column',
                      val === 'properties' ? 'street_address' : 'name'
                    );
                  } else if (val) {
                    update('linked_table', null);
                    update('linked_table_id', val);
                    update('linked_display_column', 'name');
                  } else {
                    update('linked_table', null);
                    update('linked_table_id', null);
                  }

                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="">Select a table...</option>
                <option value="properties">Properties</option>
                <option value="entities">Entities</option>
                <option value="projects">Projects</option>
                {customTables.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Display field
              </label>
              <input
                value={draft.linked_display_column || ''}
                onChange={e => update('linked_display_column', e.target.value || null)}
                placeholder={draft.linked_table === 'properties' ? 'street_address' : 'name'}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                Which field from the linked record to display
              </p>
            </div>

            {/* Combines a second field onto every label, e.g. a Matter
                Number custom field alongside the Project Name display field
                -- "260586 — Onsell Contract - Dahlia by Azure Lot 35" in
                every search-and-choose bar for this relation (see
                supabase/company_table_fields_display_field_2.sql). Offers
                the same candidates as "Also search by" below for a system-
                table target, or the linked custom table's own fields. */}
            {(draft.linked_table || draft.linked_table_id) && (
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Also show
                </label>
                <select
                  value={draft.linked_display_column_2 || ''}
                  onChange={e => update('linked_display_column_2', e.target.value || null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                >
                  <option value="">None</option>
                  {draft.linked_table && (SEARCH_COLUMNS[draft.linked_table] || []).map(col => (
                    <option key={col} value={col}>{prettifyColumn(col)}</option>
                  ))}
                  {draft.linked_table && customFieldOptions.map(cf => (
                    <option key={`cf:${cf.id}`} value={`cf:${cf.id}`}>{cf.label}</option>
                  ))}
                  {draft.linked_table_id && linkedTableFieldOptions.map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  Combined onto the display field wherever this relation is searched, e.g. &quot;260586 — Onsell Contract&quot;
                </p>
              </div>
            )}

            {/* Multi-record relations -- custom-table fields only (see
                supabase/company_table_field_allow_multiple.sql). Off by
                default so every existing relation field keeps its current
                single-value behavior unchanged. */}
            {draft.isCustomTable && (
              <label className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => update('allow_multiple', !draft.allow_multiple)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                    draft.allow_multiple
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-slate-200 group-hover:border-indigo-300'
                  }`}
                >
                  {draft.allow_multiple && <Check size={12} className="text-white" />}
                </div>
                <span className="text-[12px] font-medium text-slate-600">Allow linking to multiple records</span>
              </label>
            )}

            {/* Search fields + restrict-to filter -- system-table relations
                on custom-table fields only (see
                supabase/company_table_fields_relation_config.sql). */}
            {draft.isCustomTable && draft.linked_table && SEARCH_COLUMNS[draft.linked_table] && (
              <>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                    Also search by
                  </label>
                  <div className="space-y-1.5">
                    {SEARCH_COLUMNS[draft.linked_table].map(col => (
                      <label key={col} className="flex items-center gap-2.5 cursor-pointer group">
                        <div
                          onClick={() => toggleSearchField(col)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                            (draft.linked_search_field_keys || []).includes(col)
                              ? 'bg-indigo-600 border-indigo-600'
                              : 'border-slate-200 group-hover:border-indigo-300'
                          }`}
                        >
                          {(draft.linked_search_field_keys || []).includes(col) && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-[12px] font-medium text-slate-600">{prettifyColumn(col)}</span>
                      </label>
                    ))}
                    {customFieldOptions.map(cf => {
                      const key = `cf:${cf.id}`;
                      return (
                        <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                          <div
                            onClick={() => toggleSearchField(key)}
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                              (draft.linked_search_field_keys || []).includes(key)
                                ? 'bg-indigo-600 border-indigo-600'
                                : 'border-slate-200 group-hover:border-indigo-300'
                            }`}
                          >
                            {(draft.linked_search_field_keys || []).includes(key) && <Check size={10} className="text-white" />}
                          </div>
                          <span className="text-[12px] font-medium text-slate-600">{cf.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 px-1">
                    Typing in the picker also matches these, e.g. a Matter Number
                  </p>
                </div>

                {FILTER_COLUMNS[draft.linked_table].length > 0 && (
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                      Restrict to
                    </label>
                    <select
                      value={draft.linked_filter_column || ''}
                      onChange={e => {
                        const col = e.target.value || null;
                        update('linked_filter_column', col);
                        update('linked_filter_value', col === 'linked_profile_id' ? CURRENT_USER_SENTINEL : null);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                    >
                      <option value="">No restriction, show all</option>
                      {FILTER_COLUMNS[draft.linked_table].map(col => (
                        <option key={col} value={col}>{col === 'linked_profile_id' ? 'Signed-in user only' : prettifyColumn(col)}</option>
                      ))}
                    </select>
                    {draft.linked_filter_column === 'entity_type' ? (
                      <select
                        value={draft.linked_filter_value || ''}
                        onChange={e => update('linked_filter_value', e.target.value || null)}
                        className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                      >
                        <option value="">Select a value...</option>
                        {ENTITY_TYPE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : draft.linked_filter_column === 'linked_profile_id' ? (
                      <>
                        <select
                          value={draft.linked_filter_value || CURRENT_USER_SENTINEL}
                          onChange={e => update('linked_filter_value', e.target.value)}
                          className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                        >
                          <option value={CURRENT_USER_SENTINEL}>Signed-in user only</option>
                          <option value={TEAM_SCOPE_SENTINEL}>Company members (admin sees all, others see only themselves)</option>
                        </select>
                        <p className="mt-2 bg-indigo-50 border border-indigo-100 rounded-2xl py-2 px-3 text-[11px] font-medium text-indigo-700">
                          {draft.linked_filter_value === TEAM_SCOPE_SENTINEL
                            ? 'Restricted to entity_type = Staff. A company admin can pick anyone (bill as someone else); everyone else can only pick themselves.'
                            : 'Only shows (and auto-fills) the entity linked to whoever is signed in. Each person only sees their own, via the entity’s “Link to a team member” on its detail page.'}
                        </p>
                      </>
                    ) : draft.linked_filter_column ? (
                      <input
                        value={draft.linked_filter_value || ''}
                        onChange={e => update('linked_filter_value', e.target.value || null)}
                        placeholder="Value to match"
                        className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : null}
                    {draft.linked_filter_column && draft.linked_filter_column !== 'linked_profile_id' && (
                      <p className="text-[10px] text-slate-400 mt-1.5 px-1">
                        Only show records where {prettifyColumn(draft.linked_filter_column)} matches this
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Auto ID config */}
        {draft.field_type === 'auto_id' && (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                ID format
              </label>
              <select
                value={draft.auto_generate_type || 'sequential'}
                onChange={e => update('auto_generate_type', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
              >
                <option value="sequential">Sequential (1, 2, 3...)</option>
                <option value="custom_prefix">Custom prefix (e.g. PROP-001)</option>
                <option value="date_prefix">Date prefix (e.g. 2024-001)</option>
                <option value="uuid">UUID</option>
              </select>
            </div>
            {(['custom_prefix', 'date_prefix'] as string[]).includes(draft.auto_generate_type || '') && (
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Prefix
                </label>
                <input
                  value={draft.auto_generate_prefix || ''}
                  onChange={e => update('auto_generate_prefix', e.target.value || null)}
                  placeholder="e.g. PROP-"
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}
          </div>
        )}

        {/* Auto numbering — text fields on either a custom table (server-
            side sequence, see supabase/company_table_field_sequences.sql)
            or a system table like projects' Matter Number (see
            supabase/migrations/20260730180000_custom_field_auto_numbering.sql
            -- same UI/columns, separate counter table per side). */}
        {draft.field_type === 'text' && !draft.formula_type && (
          <AutoNumberConfig
            value={{ prefix: draft.auto_number_prefix ?? null, start: draft.auto_number_start ?? null, pad: draft.auto_number_pad ?? null }}
            onChange={next => setDraft(prev => ({ ...prev, auto_number_prefix: next.prefix, auto_number_start: next.start, auto_number_pad: next.pad }))}
            onContinueFromLatest={handleContinueFromLatest}
          />
        )}

        {/* Number / currency min/max */}
        {(NUMERIC_FIELD_TYPES as FieldType[]).includes(draft.field_type) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Min value
              </label>
              <input
                type="number"
                value={draft.validation_min ?? ''}
                onChange={e => update('validation_min', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                Max value
              </label>
              <input
                type="number"
                value={draft.validation_max ?? ''}
                onChange={e => update('validation_max', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        )}

        {/* Computed value — number/currency fields, plus date fields (date
            only ever offers "Max of related", see below). Multiply/% of are
            custom-table only and numeric-only (they reference a SIBLING
            field on the same table); "Sum of related"/"Max of related" are
            available on both custom AND system tables (projects/entities/
            properties) -- they aggregate a field on a RELATED custom table
            instead. Max (unlike sum) also works on dates -- e.g. "the latest
            end date among a loan's Interest Only phases". */}
        {((NUMERIC_FIELD_TYPES as FieldType[]).includes(draft.field_type) || draft.field_type === 'date') && (() => {
          const isNumericType = (NUMERIC_FIELD_TYPES as FieldType[]).includes(draft.field_type);
          // Excludes the field itself (direct self-reference) and anything
          // that already transitively depends on it (would close a cycle --
          // e.g. this field can't pick B as a dependency if B already
          // computes off this field, directly or through a longer chain).
          // Only meaningful for multiply/percentage_of's same-table siblings
          // -- sum_related/max_related's candidates come from a different
          // table entirely and have no such cycle risk (see the
          // sumNumericFieldOptions picker below).
          const numericSiblings = siblingFields.filter(
            f => f.id !== draft.id
              && (NUMERIC_FIELD_TYPES as FieldType[]).includes(f.field_type)
              && !dependsOnField(f.id, draft.id, siblingFields)
          );
          return (
            <div className="space-y-3">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                Computed value
              </label>
              <div className="flex gap-2">
                {[
                  { v: null, l: 'Typed in' },
                  ...(draft.isCustomTable && isNumericType ? [{ v: 'multiply', l: 'Multiply' }, { v: 'percentage_of', l: '% of' }] : []),
                  ...(isNumericType ? [{ v: 'sum_related', l: 'Sum of related' }] : []),
                  { v: 'max_related', l: 'Max of related' },
                ].map(opt => (
                  <button
                    key={String(opt.v)}
                    onClick={() => {
                      update('formula_type', opt.v);
                      if (!opt.v) {
                        update('formula_field_a_id', null);
                        update('formula_field_b_id', null);
                        update('formula_percent', null);
                        update('formula_relation_field_id', null);
                        update('formula_condition_field_id', null);
                        update('formula_condition_value', null);
                        setSumChildTableId('');
                      } else if (opt.v !== 'sum_related' && opt.v !== 'max_related') {
                        update('formula_relation_field_id', null);
                        update('formula_condition_field_id', null);
                        update('formula_condition_value', null);
                        setSumChildTableId('');
                      } else {
                        update('formula_field_b_id', null);
                        update('formula_percent', null);
                      }
                    }}
                    className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${
                      (draft.formula_type ?? null) === opt.v
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>

              {(draft.formula_type === 'sum_related' || draft.formula_type === 'max_related') && (
                <div className="space-y-2">
                  <select
                    value={sumChildTableId}
                    onChange={e => {
                      setSumChildTableId(e.target.value);
                      update('formula_relation_field_id', null);
                      update('formula_field_a_id', null);
                      update('formula_condition_field_id', null);
                      update('formula_condition_value', null);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">From table...</option>
                    {customTables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select
                    value={draft.formula_relation_field_id || ''}
                    onChange={e => update('formula_relation_field_id', e.target.value || null)}
                    disabled={!sumChildTableId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none disabled:opacity-50"
                  >
                    <option value="">Which field on that table links back here...</option>
                    {sumRelationFieldOptions.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <select
                    value={draft.formula_field_a_id || ''}
                    onChange={e => update('formula_field_a_id', e.target.value || null)}
                    disabled={!sumChildTableId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none disabled:opacity-50"
                  >
                    <option value="">{draft.formula_type === 'max_related' ? 'Field to take the max of...' : 'Field to sum...'}</option>
                    {sumNumericFieldOptions.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>

                  {/* Optional "Only where" filter -- e.g. a Matter's
                      "Billable Fees" should only sum Time & Fee Entries
                      where Billable = Yes, not every entry. Clearing the
                      field back to "(no filter)" also clears the value so
                      a stale value can never linger unpaired. */}
                  <select
                    value={draft.formula_condition_field_id || ''}
                    onChange={e => {
                      update('formula_condition_field_id', e.target.value || null);
                      update('formula_condition_value', null);
                    }}
                    disabled={!sumChildTableId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none disabled:opacity-50"
                  >
                    <option value="">Only where (optional)...</option>
                    {sumConditionFieldOptions.filter(f => f.id !== draft.formula_field_a_id).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  {draft.formula_condition_field_id && (() => {
                    const conditionField = sumConditionFieldOptions.find(f => f.id === draft.formula_condition_field_id);
                    if (!conditionField) return null;
                    if (conditionField.field_type === 'boolean') {
                      return (
                        <div className="flex gap-2">
                          {['true', 'false'].map(v => (
                            <button
                              key={v}
                              onClick={() => update('formula_condition_value', v)}
                              className={`flex-1 py-2 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                                draft.formula_condition_value === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              {v === 'true' ? 'Yes' : 'No'}
                            </button>
                          ))}
                        </div>
                      );
                    }
                    if (conditionField.field_type === 'select' && conditionField.select_options?.length) {
                      return (
                        <select
                          value={draft.formula_condition_value || ''}
                          onChange={e => update('formula_condition_value', e.target.value || null)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                        >
                          <option value="">Equal to...</option>
                          {conditionField.select_options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      );
                    }
                    return (
                      <input
                        value={draft.formula_condition_value || ''}
                        onChange={e => update('formula_condition_value', e.target.value || null)}
                        placeholder="Equal to..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    );
                  })()}
                </div>
              )}

              {draft.formula_type === 'multiply' && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={draft.formula_field_a_id || ''}
                    onChange={e => update('formula_field_a_id', e.target.value || null)}
                    className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">Field A...</option>
                    {numericSiblings.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <select
                    value={draft.formula_field_b_id || ''}
                    onChange={e => update('formula_field_b_id', e.target.value || null)}
                    className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">Field B...</option>
                    {numericSiblings.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              )}

              {draft.formula_type === 'percentage_of' && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={draft.formula_field_a_id || ''}
                    onChange={e => update('formula_field_a_id', e.target.value || null)}
                    className="bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none appearance-none"
                  >
                    <option value="">Of field...</option>
                    {numericSiblings.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <div className="relative">
                    <input
                      type="number"
                      value={draft.formula_percent ?? ''}
                      onChange={e => update('formula_percent', e.target.value ? Number(e.target.value) : null)}
                      placeholder="10"
                      className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-4 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">%</span>
                  </div>
                </div>
              )}

              {draft.formula_type && (
                <p className="text-[10px] text-slate-400 px-1">
                  Auto-calculated, not editable by hand once saved.
                </p>
              )}
            </div>
          );
        })()}

        {/* Text regex validation -- not offered for abn/acn, which get
            checksum validation (isValidABN/isValidACN) instead of a
            user-supplied pattern */}
        {draft.field_type === 'text' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Validation pattern (regex)
            </label>
            <input
              value={draft.validation_regex || ''}
              onChange={e => update('validation_regex', e.target.value || null)}
              placeholder="e.g. ^[A-Z]{2}\d{4}$"
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-mono text-[12px] outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        )}

        {/* Default value */}
        {!([...RELATION_FIELD_TYPES, 'auto_id', 'boolean'] as FieldType[]).includes(draft.field_type) && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Default value
            </label>
            <input
              value={draft.default_value || ''}
              onChange={e => update('default_value', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        )}

        {/* Boolean fields get a checked/unchecked toggle instead of the
            free-text input above -- e.g. a "Billable" field that should
            start checked on a new quick-add entry. Encoded as text
            ('true'/'false') in the same default_value column. */}
        {draft.field_type === 'boolean' && (
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
              Default value
            </label>
            <div className="flex gap-1.5">
              {(['false', 'true'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update('default_value', v)}
                  className={`flex-1 py-2 rounded-full text-[11px] font-bold uppercase tracking-wide transition-all ${
                    (draft.default_value ?? 'false') === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {v === 'true' ? 'Checked' : 'Unchecked'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Constraints */}
        <div className="space-y-2">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
            Constraints
          </label>
          {[
            { key: 'is_required',   label: 'Required (must have a value)' },
            { key: 'is_unique',     label: 'Unique (no two records can share this value)' },
            { key: 'show_in_table', label: 'Show in master table columns' },
          ].map(constraint => (
            <label key={constraint.key} className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => update(
                  constraint.key as keyof CustomField,
                  !draft[constraint.key as keyof CustomField]
                )}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                  draft[constraint.key as keyof CustomField]
                    ? 'bg-indigo-600 border-indigo-600'
                    : 'border-slate-200 group-hover:border-indigo-300'
                }`}
              >
                {draft[constraint.key as keyof CustomField] && (
                  <Check size={12} className="text-white" />
                )}
              </div>
              <span className="text-[12px] font-medium text-slate-600">{constraint.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-slate-100 space-y-2">
      {(saveDisabledReason || deleteDisabledReason) && (
        <p className="text-[10px] font-medium text-slate-400 px-1">{saveDisabledReason || deleteDisabledReason}</p>
      )}
      {saveErrors.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl py-2.5 px-3.5 space-y-1">
          {saveErrors.map((err, i) => (
            <p key={i} className="text-[11px] font-medium text-red-600">{err}</p>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !!saveDisabledReason}
          title={saveDisabledReason || undefined}
          className="flex-1 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save field'}
        </button>
        <button
          onClick={async () => {
            // onDelete (SchemaVisualisation.handleDeleteField) does its own
            // confirm with the real count of populated values, since this
            // panel has no way to know that count itself. Reset `deleting`
            // if it returns without actually deleting (user cancelled),
            // otherwise the button would spin forever.
            setDeleting(true);
            try {
              await onDelete();
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting || !!deleteDisabledReason}
          title={deleteDisabledReason || undefined}
          className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all disabled:opacity-40"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
      </div>
    </div>
  );
}