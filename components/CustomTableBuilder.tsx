"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Check, X, Settings, Pencil, Store, RotateCcw, MapPin, Building2, LayoutGrid, CheckSquare, Lock } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import { useCompany, type TableLabelOverride } from "@/components/CompanyContext";
import { createArchiveRequest, usePendingArchiveRequests } from "@/lib/archiveRequests";

// The 4 built-in tables every company starts with -- shown in the same list
// as a company's own tables (see the header comment below for why) rather
// than a separate "system" section. Icons mirror Sidebar.tsx's ALL_SYSTEM_TABLES.
const SYSTEM_TABLE_DEFS = [
  { slug: 'properties', icon: MapPin,      color: '#6366f1' },
  { slug: 'entities',   icon: Building2,   color: '#8b5cf6' },
  { slug: 'projects',   icon: LayoutGrid,  color: '#ec4899' },
  { slug: 'tasks',      icon: CheckSquare, color: '#0ea5e9' },
];
const DEFAULT_LABELS: Record<string, TableLabelOverride> = {
  projects: { singular: "Project", plural: "Projects" },
  properties: { singular: "Property", plural: "Properties" },
  entities: { singular: "Entity", plural: "Entities" },
  tasks: { singular: "Task", plural: "Tasks" },
};

const ICON_OPTIONS = [
  'Table2', 'FileText', 'Briefcase', 'Users', 'Home',
  'Car', 'Truck', 'Package', 'ShoppingCart', 'CreditCard',
  'BarChart2', 'PieChart', 'Calendar', 'Clock', 'Globe',
  'Map', 'Layers', 'Database', 'Server', 'Cloud',
];

const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

export default function CustomTableBuilder() {
  const { isAdmin, companyId, userId, tableLabelOverrides, refreshTableLabelOverrides, disabledSystemTables, refreshDisabledSystemTables } = useCompany();
  const { tables, loading, refetch } = useCustomTables(userId);
  const [deletingSystemSlug, setDeletingSystemSlug] = useState<string | null>(null);
  const [restoringSystemSlug, setRestoringSystemSlug] = useState<string | null>(null);
  const { pendingIds: pendingArchiveIds, refreshPendingArchiveRequests } = usePendingArchiveRequests("company_tables", companyId);
  const [editingSystemSlug, setEditingSystemSlug] = useState<string | null>(null);
  const [systemDraft, setSystemDraft] = useState<TableLabelOverride>({ singular: "", plural: "" });
  const [systemSaving, setSystemSaving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Table2');
  const [newColor, setNewColor] = useState('#6366f1');
  // Private tables are visible only to their creator (see supabase/
  // migrations/20260727040000_default_and_private_tables_dashboards.sql) --
  // any user can create one, admin or not; this is additive to the existing
  // (unchanged) shared-table creation, not a replacement for it.
  const [newIsPrivate, setNewIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<number | null>(null);
  const [editingTable, setEditingTable] = useState<{ id: string; name: string; icon: string; color: string; owner_user_id: string | null; is_from_template: boolean } | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Table2');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('companies')
      .select('max_custom_tables')
      .eq('id', '00000000-0000-0000-0000-000000000000') // placeholder, resolved by RLS
      .single()
      .then(({ data }) => { if (data) setLimit(data.max_custom_tables); });
  }, []);

  // Renaming one of the 3 built-in tables (e.g. "Projects" -> "Matters" for
  // a law firm) -- see supabase/companies_table_labels.sql. Distinct from
  // handleUpdate below (that renames/re-icons/re-colours a company's own
  // table row in company_tables); these 3 aren't real rows, just a label
  // override stored on companies.table_label_overrides, so there's no
  // icon/colour to change and no delete.
  const startSystemEdit = (slug: string) => {
    const current = tableLabelOverrides[slug] || DEFAULT_LABELS[slug];
    setSystemDraft({ singular: current.singular, plural: current.plural });
    setEditingSystemSlug(slug);
  };

  const saveSystemLabel = async (slug: string) => {
    if (!companyId || !systemDraft.singular.trim() || !systemDraft.plural.trim()) return;
    setSystemSaving(slug);
    const next = { ...tableLabelOverrides, [slug]: { singular: systemDraft.singular.trim(), plural: systemDraft.plural.trim() } };
    const { error } = await supabase.from("companies").update({ table_label_overrides: next }).eq("id", companyId);
    setSystemSaving(null);
    if (error) { alert(error.message); return; }
    setEditingSystemSlug(null);
    await refreshTableLabelOverrides();
  };

  const resetSystemLabel = async (slug: string) => {
    if (!companyId) return;
    if (!window.confirm(`Reset "${(tableLabelOverrides[slug] || DEFAULT_LABELS[slug]).plural}" back to its default name "${DEFAULT_LABELS[slug].plural}"?`)) return;
    setSystemSaving(slug);
    const next = { ...tableLabelOverrides };
    delete next[slug];
    const { error } = await supabase.from("companies").update({ table_label_overrides: next }).eq("id", companyId);
    setSystemSaving(null);
    if (error) { alert(error.message); return; }
    await refreshTableLabelOverrides();
  };

  // "Deleting" a built-in table -- there's no company_tables row for it, so
  // this hides it everywhere a user browses tables (Sidebar/schema config/
  // schema map/schema editor/the table's own page all check
  // disabledSystemTables) and soft-deletes every field the company added to
  // it, same deleted_at each field would get removed one at a time from the
  // schema editor. Admin-only (like renaming a built-in table above) rather
  // than going through the non-admin archive-request flow custom tables use
  // below -- that flow is keyed on a real row id in one of a fixed list of
  // tables (see lib/archiveRequests.ts), which doesn't fit "a JSON flag on
  // companies."
  const handleDeleteSystemTable = async (slug: string) => {
    if (!companyId) return;
    const label = (tableLabelOverrides[slug] || DEFAULT_LABELS[slug]).plural;
    const { data: liveFields } = await supabase
      .from('company_custom_fields')
      .select('id')
      .eq('table_name', slug)
      .is('deleted_at', null);
    const fieldIds = (liveFields || []).map(f => f.id);

    if (!window.confirm(
      fieldIds.length > 0
        ? `Delete "${label}"? It has ${fieldIds.length} field${fieldIds.length === 1 ? '' : 's'} added to it. This hides it and moves those fields to Trash; nothing is deleted permanently, and you can restore it from there.`
        : `Delete "${label}"? This hides it and can be restored later from Trash.`
    )) return;

    setDeletingSystemSlug(slug);
    const deletedAt = new Date().toISOString();

    if (fieldIds.length > 0) {
      await supabase.from('company_custom_fields').update({ deleted_at: deletedAt }).in('id', fieldIds);
    }
    const next = { ...disabledSystemTables, [slug]: { deleted_at: deletedAt, field_ids: fieldIds } };
    const { error } = await supabase.from('companies').update({ disabled_system_tables: next }).eq('id', companyId);

    setDeletingSystemSlug(null);
    if (error) { alert(error.message); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await Promise.all(fieldIds.map(id =>
      logSchemaChange({ companyId, actorId: user?.id ?? null, entityType: 'company_custom_field', entityId: id, entityLabel: label, action: 'delete' })
    ));

    await refreshDisabledSystemTables();
  };

  // Bringing a hidden built-in table back -- same operation as the restore
  // button in Settings > Trash (see app/(app)/dashboard/settings/trash/
  // page.tsx), just reachable from the "New table" flow too so a company
  // that starts with all 4 hidden (see supabase/migrations/
  // 20260805070000_hide_system_tables_for_templateless_companies.sql)
  // doesn't have to already know Trash exists to get one back. Un-deletes
  // whichever fields the earlier delete recorded against this slug (empty
  // for a table that was only ever hidden by default, never actually used).
  const restoreSystemTable = async (slug: string) => {
    if (!companyId) return;
    const entry = disabledSystemTables[slug];
    if (!entry) return;
    setRestoringSystemSlug(slug);
    if (entry.field_ids.length > 0) {
      await supabase.from('company_custom_fields').update({ deleted_at: null }).in('id', entry.field_ids);
    }
    const next = { ...disabledSystemTables };
    delete next[slug];
    const { error } = await supabase.from('companies').update({ disabled_system_tables: next }).eq('id', companyId);
    setRestoringSystemSlug(null);
    if (error) { alert(error.message); return; }
    await refreshDisabledSystemTables();
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');

    const slug = newName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles').select('active_company_id').eq('id', user?.id).single();
    const companyId = prof?.active_company_id;

    // A non-admin can only ever create a private table (RLS agrees, see
    // ct_insert) -- force it here too rather than trusting newIsPrivate,
    // since that checkbox is hidden/disabled for a non-admin in the modal
    // below, not removed from state.
    const { data: created, error: err } = await supabase.from('company_tables').insert({
      company_id: companyId,
      name: newName.trim(),
      slug,
      icon: newIcon,
      color: newColor,
      display_order: tables.length,
      owner_user_id: (newIsPrivate || !isAdmin) ? user?.id : null,
    }).select().single();

    setSaving(false);

    if (err) {
      setError(err.message.includes('limit') ? err.message : `Could not create table: ${err.message}`);
      return;
    }

    if (created && companyId) {
      logSchemaChange({
        companyId, actorId: user?.id ?? null, entityType: 'company_table',
        entityId: created.id, entityLabel: created.name, action: 'create', after: created,
      });
    }

    setCreating(false);
    setNewName('');
    setNewIsPrivate(false);
    refetch();
  };

  const handleDelete = async (tableId: string, tableName: string, ownerUserId: string | null, isFromTemplate: boolean) => {
    // Installed-from-template tables are permanently locked (RLS + a
    // trigger both refuse this, for anyone including an admin -- see
    // supabase/migrations/20260803030000_lock_template_schema.sql) -- the
    // Trash2 button is hidden for these already, this is just a defensive
    // backstop against a stale render.
    if (isFromTemplate) { window.alert(`"${tableName}" was installed from a template and can never be deleted.`); return; }

    // A private table is fully this user's own -- no need to route through
    // admin approval just because they aren't a company admin (RLS's own
    // delete policy agrees: owner_user_id = auth.uid() is enough on its own).
    const isOwnPrivateTable = !!userId && ownerUserId === userId;
    if (!isAdmin && !isOwnPrivateTable) {
      if (!window.confirm(`Request deleting the "${tableName}" table? A company admin will need to approve it.`)) return;
      if (!companyId) return;
      const result = await createArchiveRequest("company_tables", tableId, `Table: ${tableName}`, companyId);
      if (!result.ok) { window.alert(result.error); return; }
      window.alert(result.alreadyPending ? "Already requested. Waiting on admin review." : "Deletion requested. A company admin will review it.");
      refreshPendingArchiveRequests();
      return;
    }

    const { count } = await supabase
      .from('company_table_records')
      .select('id', { count: 'exact', head: true })
      .eq('table_id', tableId)
      .is('deleted_at', null);
    const recordCount = count ?? 0;

    const warning = recordCount > 0
      ? `Delete "${tableName}"? It has ${recordCount} record${recordCount === 1 ? '' : 's'}. This moves it to Trash; nothing is deleted permanently, and you can restore it (with its records) from there.`
      : `Delete "${tableName}"? This moves it to Trash and can be restored later.`;
    if (!window.confirm(warning)) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: before } = await supabase.from('company_tables').select('*').eq('id', tableId).single();

    // Soft-delete — the table and its records/fields stay in the database
    // (nothing cascades), so this is fully reversible from Trash.
    await supabase.from('company_tables').update({ deleted_at: new Date().toISOString() }).eq('id', tableId);

    if (before) {
      logSchemaChange({
        companyId: before.company_id, actorId: user?.id ?? null, entityType: 'company_table',
        entityId: tableId, entityLabel: tableName, action: 'delete', before,
      });
    }

    refetch();
  };

  const openEdit = (table: { id: string; name: string; icon: string; color: string; owner_user_id: string | null; is_from_template: boolean }) => {
    if (table.is_from_template) { window.alert(`"${table.name}" was installed from a template and can never be edited.`); return; }
    if (!isAdmin && table.owner_user_id !== userId) { window.alert(`Only a company admin can edit "${table.name}".`); return; }
    setEditingTable(table);
    setEditName(table.name);
    setEditIcon(table.icon);
    setEditColor(table.color);
  };

  const handleUpdate = async () => {
    if (!editingTable || !editName.trim()) return;
    setEditSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: before } = await supabase.from('company_tables').select('*').eq('id', editingTable.id).single();

    const { data: after, error: err } = await supabase
      .from('company_tables')
      .update({ name: editName.trim(), icon: editIcon, color: editColor })
      .eq('id', editingTable.id)
      .select()
      .single();

    setEditSaving(false);

    if (err) { setError(`Could not update table: ${err.message}`); return; }

    if (before && after) {
      logSchemaChange({
        companyId: before.company_id, actorId: user?.id ?? null, entityType: 'company_table',
        entityId: editingTable.id, entityLabel: after.name, action: 'update', before, after,
      });
    }

    setEditingTable(null);
    refetch();
  };

  // Snapshots this table's current shape into a brand-new draft template —
  // a one-time copy, not a live link (see supabase/template_marketplace.sql).
  // Cross-table relations to another *custom* table aren't carried over
  // (nothing to resolve them against outside this single table's export);
  // relations to a system table (entities/projects/properties) are kept.
  const handlePublish = async (table: { id: string; name: string; icon: string; color: string; slug: string; primary_field_key: string | null }) => {
    const templateName = window.prompt(`Publish "${table.name}" to the marketplace as a new template. Template name:`, table.name);
    if (!templateName?.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('active_company_id').eq('id', user?.id).single();
    const companyId = prof?.active_company_id;
    if (!companyId) return;

    const { data: fields } = await supabase.from('company_table_fields').select('*').eq('table_id', table.id).is('deleted_at', null).order('display_order');

    const slug = `${templateName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
    const { data: template, error: tErr } = await supabase.from('template_definitions').insert({
      slug, name: templateName.trim(), owner_company_id: companyId, is_published: false,
    }).select().single();
    if (tErr || !template) { alert(tErr?.message || 'Could not create template'); return; }

    const { data: templateTable, error: ttErr } = await supabase.from('template_definition_tables').insert({
      template_id: template.id, slug: table.slug, name: table.name, icon: table.icon, color: table.color,
      primary_field_key: table.primary_field_key, display_order: 0,
    }).select().single();
    if (ttErr || !templateTable) { alert(ttErr?.message || 'Could not publish table'); return; }

    if (fields && fields.length > 0) {
      await supabase.from('template_definition_table_fields').insert(fields.map(f => ({
        template_table_id: templateTable.id, field_key: f.field_key, label: f.label, field_type: f.field_type,
        select_options: f.select_options, linked_system_table: f.linked_system_table, linked_display_field: f.linked_display_field,
        is_required: f.is_required, is_unique: f.is_unique, show_in_table: f.show_in_table,
        display_order: f.display_order, section_name: f.section_name, help_text: f.help_text,
      })));
    }

    logSchemaChange({ companyId, actorId: user?.id ?? null, entityType: 'template_definition', entityId: template.id, entityLabel: template.name, action: 'create', after: template });
    alert(`Published as a draft template. Find it under Marketplace → My templates to review and publish.`);
  };

  const visibleSystemTableDefs = SYSTEM_TABLE_DEFS.filter(t => !disabledSystemTables[t.slug]);
  // Only an admin can bring one back -- restoring is company-wide, same
  // level of impact as handleDeleteSystemTable hiding it in the first
  // place (also admin-only above).
  const hiddenSystemTableDefs = isAdmin ? SYSTEM_TABLE_DEFS.filter(t => disabledSystemTables[t.slug]) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-slate-800">Tables</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {visibleSystemTableDefs.length + tables.length} table{visibleSystemTableDefs.length + tables.length !== 1 ? 's' : ''}
            {limit && ` · ${limit - tables.length} more can be created`}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
        >
          <Plus size={13} /> New table
        </button>
      </div>

      {/* Existing tables -- the 3 built-in ones first, then a company's own,
          in one undifferentiated list (only their available actions differ:
          built-ins can't be re-iconed, and can only be renamed/deleted by an
          admin -- see handleDeleteSystemTable above). Deleted built-ins
          (disabledSystemTables) simply don't render here at all, same as a
          soft-deleted custom table not appearing in `tables`. */}
      <div className="space-y-2">
        {visibleSystemTableDefs.map(({ slug, icon: Icon, color }) => {
          const override = tableLabelOverrides[slug];
          const effective = override || DEFAULT_LABELS[slug];
          const isEditing = editingSystemSlug === slug;
          const isSaving = systemSaving === slug;
          const isDeleting = deletingSystemSlug === slug;
          return (
            <div key={slug} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
              {isEditing ? (
                <>
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      value={systemDraft.singular}
                      onChange={e => setSystemDraft(d => ({ ...d, singular: e.target.value }))}
                      placeholder="Singular, e.g. Matter"
                      className="px-3 py-2 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      value={systemDraft.plural}
                      onChange={e => setSystemDraft(d => ({ ...d, plural: e.target.value }))}
                      placeholder="Plural, e.g. Matters"
                      className="px-3 py-2 text-[12px] border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <button onClick={() => saveSystemLabel(slug)} disabled={isSaving} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button onClick={() => setEditingSystemSlug(null)} disabled={isSaving} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{effective.plural}</p>
                    <p className="text-[10px] text-slate-400">/dashboard/{slug}</p>
                  </div>
                  {isAdmin && (
                    <>
                      {override && (
                        <button
                          onClick={() => resetSystemLabel(slug)}
                          disabled={isSaving}
                          title="Reset to default name"
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => startSystemEdit(slug)}
                        className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all"
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteSystemTable(slug)}
                        disabled={isDeleting}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
        {tables.map(table => {
          const Icon = (LucideIcons as any)[table.icon] || LucideIcons.Table2;
          return (
            <div key={table.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${table.color}20` }}
              >
                <Icon size={16} style={{ color: table.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-800">{table.name}</p>
                <p className="text-[10px] text-slate-400">/dashboard/{table.slug}</p>
              </div>
              {table.is_from_template && (
                <span title="Installed from a template -- can never be edited or deleted" className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase bg-slate-100 text-slate-500 whitespace-nowrap">
                  <Lock size={9} /> Template
                </span>
              )}
              {pendingArchiveIds.has(table.id) && (
                <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase bg-amber-50 text-amber-600 whitespace-nowrap">
                  Deletion requested
                </span>
              )}
              <button
                onClick={() => handlePublish(table)}
                className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-full transition-all"
                title="Publish to marketplace"
              >
                <Store size={14} />
              </button>
              {/* Editing a shared table (not one you privately own) is
                  admin-only -- see ct_update in supabase/migrations/
                  20260803030000_lock_template_schema.sql, which also
                  refuses ANY edit once is_from_template. */}
              {!table.is_from_template && (isAdmin || table.owner_user_id === userId) && (
                <button
                  onClick={() => openEdit(table)}
                  className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all"
                  title="Rename / re-icon"
                >
                  <Pencil size={14} />
                </button>
              )}
              {!table.is_from_template && (
                <button
                  onClick={() => handleDelete(table.id, table.name, table.owner_user_id, table.is_from_template)}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">New table</h3>
              <button onClick={() => setCreating(false)} className="p-2 text-slate-300 hover:text-black">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              {hiddenSystemTableDefs.length > 0 && (
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                    Add a built-in table
                  </label>
                  <div className="space-y-1.5">
                    {hiddenSystemTableDefs.map(({ slug, icon: Icon, color }) => {
                      const label = (tableLabelOverrides[slug] || DEFAULT_LABELS[slug]).plural;
                      const isRestoring = restoringSystemSlug === slug;
                      return (
                        <button
                          key={slug}
                          onClick={async () => { await restoreSystemTable(slug); setCreating(false); }}
                          disabled={isRestoring}
                          className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition-all text-left disabled:opacity-50"
                        >
                          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                            <Icon size={15} style={{ color }} />
                          </div>
                          <span className="flex-1 text-[12px] font-bold text-slate-700">{label}</span>
                          {isRestoring ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <Plus size={14} className="text-slate-300" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-4 mb-1">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Or create a custom table</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Table name
                </label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="e.g. Leases, Clients, Invoices"
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Icon
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {ICON_OPTIONS.map(iconName => {
                    const Icon = (LucideIcons as any)[iconName];
                    return (
                      <button
                        key={iconName}
                        onClick={() => setNewIcon(iconName)}
                        className={`p-2 rounded-xl transition-all ${
                          newIcon === iconName
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'hover:bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Icon size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Colour
                </label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newColor === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Only a company admin can create a SHARED table (see
                  ct_insert in supabase/migrations/20260803030000_lock_
                  template_schema.sql) -- a non-admin can only ever create
                  one that's private to themselves, so the toggle is locked
                  on for them instead of hidden, so it's clear why. */}
              <button
                onClick={() => { if (isAdmin) setNewIsPrivate(p => !p); }}
                disabled={!isAdmin}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all text-left disabled:cursor-not-allowed disabled:opacity-70"
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  (newIsPrivate || !isAdmin) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                }`}>
                  {(newIsPrivate || !isAdmin) && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
                <span className="text-[12px] font-medium text-slate-600">
                  {isAdmin ? 'Private -- only visible to me' : 'Private -- only visible to me (only a company admin can add a shared table)'}
                </span>
              </button>

              {/* Preview */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                {(() => {
                  const Icon = (LucideIcons as any)[newIcon] || LucideIcons.Table2;
                  return (
                    <>
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${newColor}20` }}
                      >
                        <Icon size={16} style={{ color: newColor }} />
                      </div>
                      <span className="text-[13px] font-bold text-slate-700">
                        {newName || 'Table name'}
                      </span>
                    </>
                  );
                })()}
              </div>

              {error && (
                <p className="text-[11px] text-red-500 font-medium">{error}</p>
              )}

              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                className="w-full py-3.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Create table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — rename / re-icon / re-colour an existing table */}
      {editingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">Edit table</h3>
              <button onClick={() => setEditingTable(null)} className="p-2 text-slate-300 hover:text-black">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Table name
                </label>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => { setEditName(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdate(); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Icon
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {ICON_OPTIONS.map(iconName => {
                    const Icon = (LucideIcons as any)[iconName];
                    return (
                      <button
                        key={iconName}
                        onClick={() => setEditIcon(iconName)}
                        className={`p-2 rounded-xl transition-all ${
                          editIcon === iconName
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'hover:bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Icon size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                  Colour
                </label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        editColor === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-[11px] text-red-500 font-medium">{error}</p>
              )}

              <button
                onClick={handleUpdate}
                disabled={editSaving || !editName.trim()}
                className="w-full py-3.5 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}