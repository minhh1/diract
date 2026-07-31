// components/dashboard/TemplateManager.tsx
// Checklist template list/create/edit UI. Renders as a modal overlay when `onClose` is
// passed (embedded in a project's Checklist tab, with "Apply to this project" available via
// `onApply`/`projectId`), or as a plain in-page panel when it isn't (the standalone "Templates"
// tool in the sidebar rail — company-wide management only, no project to apply against).
"use client";
import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, Calendar, Pencil, X, Copy, ArrowLeft, CheckSquare, DollarSign, GripVertical,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

interface Profile { id: string; full_name: string | null; email: string | null; }
interface Team { id: string; team_name: string; }

export interface TemplateItem {
  id: string; template_id: string; parent_item_id: string | null; title: string;
  priority: string; assigned_team_id: string | null; assignee_id: string | null;
  is_monetary: boolean; estimated_cost: number; due_offset_days: number | null;
  due_anchor: string; display_order: number;
  due_offset_mode?: 'calendar' | 'business'; due_offset_state?: string | null;
  // Mirrors due_offset_days/due_anchor exactly -- populates the created
  // task's start_date (not just due_date) so applying a template produces
  // real Gantt duration bars, not just due-date markers. A `task_<n>`
  // start_anchor chains off that OTHER item's DUE date (a phase starts
  // when the prior phase's due/end date is reached), resolved via
  // resolveItemDate below, not resolveItemStartDate -- start-to-start
  // chaining isn't supported, only end-to-start.
  start_offset_days?: number | null;
  start_anchor?: string | null;
  // Free-text guidance carried through to the created task's own notes.
  notes?: string | null;
  // Other items' ids (within the SAME template) that must be completed
  // before this one -- resolved into real task_dependencies rows at apply
  // time (see handleApply below), same "AND semantics" task_dependencies
  // already uses elsewhere.
  depends_on_item_ids?: string[] | null;
}
export interface Template { id: string; name: string; items: TemplateItem[]; }

// "Untitled", "Untitled 1", "Untitled 2"... — picks the lowest unused number given existing names.
export function nextUntitledName(existingNames: string[]): string {
  const used = new Set(
    existingNames
      .map(n => n.match(/^Untitled(?: (\d+))?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map(m => (m[1] ? parseInt(m[1], 10) : 0))
  );
  let n = 0;
  while (used.has(n)) n++;
  return n === 0 ? 'Untitled' : `Untitled ${n}`;
}

interface TemplateManagerProps {
  templates: Template[];
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>;
  profiles: Profile[];
  teams: Team[];
  companyId: string;
  onCreateTemplate: (name: string) => Promise<Template | null>;
  /** Project context — omit all three to hide "Apply to this project" (standalone tool use). */
  projectId?: string;
  projectCreatedAt?: string;
  projectDueDate?: string | null;
  // Returns the created rows (with real ids), in the same order as
  // tasksToCreate was passed -- handleApply needs these to resolve
  // depends_on_item_ids into real task_dependencies rows. A caller that
  // doesn't support returning them (there are none left in this codebase,
  // but the type stays permissive) can return void; dependency resolution
  // is just skipped in that case.
  onApply?: (tasksToCreate: any[]) => Promise<{ id: string }[] | void>;
  /** Presence controls chrome: passed → modal overlay with an X button; omitted → plain in-page panel. */
  onClose?: () => void;
}

export default function TemplateManager({
  templates, setTemplates, profiles, teams, companyId, projectId, projectCreatedAt, projectDueDate,
  onApply, onCreateTemplate, onClose,
}: TemplateManagerProps) {
  const canApply = !!onApply && !!projectId;
  const effectiveCreatedAt = projectCreatedAt || new Date().toISOString();

  type View = 'list' | 'apply' | 'edit';
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Template | null>(null);
  const [editName, setEditName] = useState('');
  const [editItems, setEditItems] = useState<Partial<TemplateItem>[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Reorders editItems (drag from `from` to `to`), remapping every task_<index> anchor
  // reference so "After: X" links keep pointing at the same task after the shuffle, then
  // resets the dragged task's own anchor to "After: <whatever is now directly above it>"
  // (or "Project created" if it's now first). Runs on every dragover (not just drop) so the
  // other tasks visibly slide out of the way as the dragged one passes over them — `draggedIdx`
  // tracks the dragged item's current live position, so each subsequent hover moves it again
  // relative to where it already is, and self-throttles once it's sitting on the hovered row.
  const handleDragOverItem = (to: number) => {
    const from = draggedIdx;
    if (from === null || from === to) return;
    const indexMap = new Map<number, number>();
    for (let i = 0; i < editItems.length; i++) {
      if (i === from) { indexMap.set(i, to); continue; }
      if (from < to) indexMap.set(i, i > from && i <= to ? i - 1 : i);
      else indexMap.set(i, i >= to && i < from ? i + 1 : i);
    }
    const reordered = [...editItems];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const remapOne = <T extends string | null | undefined>(anchor: T): T | string => {
      const m = /^task_(\d+)$/.exec(anchor || '');
      if (!m) return anchor;
      const newRef = indexMap.get(Number(m[1]));
      return newRef !== undefined ? `task_${newRef}` : 'record_created';
    };
    const remapped = reordered.map((item, newIdx) => {
      if (newIdx === to) {
        return { ...item, due_anchor: to === 0 ? 'record_created' : `task_${to - 1}`, start_anchor: remapOne(item.start_anchor) };
      }
      return { ...item, due_anchor: remapOne(item.due_anchor), start_anchor: remapOne(item.start_anchor) };
    });
    setEditItems(remapped);
    setDraggedIdx(to);
  };

  const openEdit = (t: Template) => {
    setSelected(t);
    setEditName(t.name);
    setEditItems(t.items.map(i => ({ ...i })));
    setView('edit');
  };

  const handleCreateNew = async () => {
    setCreating(true);
    const name = nextUntitledName(templates.map((t: Template) => t.name));
    const created = await onCreateTemplate(name);
    setCreating(false);
    if (!created) return;
    setSelected(created);
    setEditName(created.name);
    setEditItems([{ title: '', due_offset_days: 0, due_anchor: 'record_created', display_order: 0 }]);
    setView('edit');
  };

  const ANCHORS = [
    { value: 'record_created', label: 'Project created' },
    { value: 'record_due', label: 'Project due date' },
  ];

  // Resolves an item's due date, following "After: <earlier task>" chains (due_anchor = `task_<index>`)
  // back to a real anchor (project created / project due date). `items` is the full ordered array the
  // index refers to — pass the same array the item's `task_<index>` values were assigned against.
  // Business-day items call date-calc for AU state-aware holiday skipping; calendar-day items resolve
  // synchronously via simple date math, still wrapped in a promise so both paths share one code path.
  const resolveItemDate = async (
    item: Partial<TemplateItem>, items: Partial<TemplateItem>[], seen: Set<number> = new Set()
  ): Promise<string | null> => {
    if (item.due_offset_days === null || item.due_offset_days === undefined) return null;
    let anchor: Date | null = null;
    if (item.due_anchor === 'record_created') {
      anchor = new Date(effectiveCreatedAt);
    } else if (item.due_anchor === 'record_due') {
      anchor = projectDueDate ? new Date(projectDueDate) : null;
    } else {
      const m = /^task_(\d+)$/.exec(item.due_anchor || '');
      if (m) {
        const idx = Number(m[1]);
        const ref = items[idx];
        if (ref && !seen.has(idx)) {
          const refDate = await resolveItemDate(ref, items, new Set(seen).add(idx));
          anchor = refDate ? new Date(refDate) : null;
        }
      } else {
        anchor = new Date();
      }
    }
    if (!anchor) return null;
    if (item.due_offset_mode === 'business' && item.due_offset_state) {
      try {
        const fromDateStr = anchor.toISOString().split('T')[0];
        const { data, error } = await supabase.functions.invoke('date-calc', {
          body: { fromDate: fromDateStr, days: item.due_offset_days, mode: 'business', state: item.due_offset_state },
        });
        if (!error && data?.resultDate) return data.resultDate;
      } catch (err) {
        console.error('[template] date-calc call failed, falling back to calendar days:', err);
      }
    }
    anchor.setDate(anchor.getDate() + (item.due_offset_days || 0));
    return anchor.toISOString().split('T')[0];
  };

  // Same shape as resolveItemDate, but for start_offset_days/start_anchor
  // -- a `task_<index>` start_anchor still chains off that OTHER item's
  // DUE date (via resolveItemDate, not this function) since "starts when
  // the prior phase finishes" is the only chaining relationship Gantt
  // templates need; start-to-start chaining isn't supported.
  const resolveItemStartDate = async (
    item: Partial<TemplateItem>, items: Partial<TemplateItem>[]
  ): Promise<string | null> => {
    if (item.start_offset_days === null || item.start_offset_days === undefined) return null;
    let anchor: Date | null = null;
    if (item.start_anchor === 'record_created') {
      anchor = new Date(effectiveCreatedAt);
    } else if (item.start_anchor === 'record_due') {
      anchor = projectDueDate ? new Date(projectDueDate) : null;
    } else {
      const m = /^task_(\d+)$/.exec(item.start_anchor || '');
      if (m) {
        const ref = items[Number(m[1])];
        if (ref) {
          const refDate = await resolveItemDate(ref, items);
          anchor = refDate ? new Date(refDate) : null;
        }
      } else {
        anchor = new Date(effectiveCreatedAt);
      }
    }
    if (!anchor) return null;
    anchor.setDate(anchor.getDate() + (item.start_offset_days || 0));
    return anchor.toISOString().split('T')[0];
  };

  // Auto-save: debounce name/item edits and persist in the background.
  // Skips the render that immediately follows opening/creating a template.
  const skipNextSave = useRef(true);
  useEffect(() => {
    skipNextSave.current = true;
  }, [selected?.id]);

  useEffect(() => {
    if (view !== 'edit' || !selected) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSaved(false);
    const timer = setTimeout(async () => {
      setSaving(true);
      const finalName = editName.trim() || nextUntitledName(
        templates.filter((t: Template) => t.id !== selected.id).map((t: Template) => t.name)
      );
      if (finalName !== editName) setEditName(finalName);
      await supabase.from('checklist_templates').update({ name: finalName }).eq('id', selected.id);
      await supabase.from('checklist_template_items').delete().eq('template_id', selected.id);

      // Persist tasks in their current list order (the user's own drag order) rather than
      // re-sorting by computed date — dragging is now how order is controlled. `due_anchor`
      // values like `task_<oldIndex>` reference positions in `editItems`; dropping empty-title
      // rows shifts everyone after them, so remap references to the filtered positions.
      const withOldIndex = editItems
        .map((item, oldIndex) => ({ item, oldIndex }))
        .filter(x => x.item.title?.trim());
      const oldToNewIndex = new Map(withOldIndex.map((x, newIndex) => [x.oldIndex, newIndex]));
      const remapAnchor = (anchor: string | null | undefined) => {
        const m = /^task_(\d+)$/.exec(anchor || '');
        if (!m) return anchor;
        const newRef = oldToNewIndex.get(Number(m[1]));
        return newRef !== undefined ? `task_${newRef}` : 'record_created';
      };
      const validItems = withOldIndex.map(({ item }) => ({
        ...item,
        due_anchor: remapAnchor(item.due_anchor),
        start_anchor: remapAnchor(item.start_anchor),
      }));

      // .select() so freshly-created items (which have no `id` yet in local
      // state) pick up their real DB-generated id -- the "Blocked by" picker
      // disables items without an id (depends_on_item_ids stores real item
      // ids, not array indices), so without this a brand new template's
      // tasks could never reference each other until the editor was closed
      // and reopened to refetch.
      let insertedItems: TemplateItem[] = [];
      if (validItems.length) {
        const { data } = await supabase.from('checklist_template_items').insert(
          validItems.map((item, i) => ({ ...item, template_id: selected.id, display_order: i }))
        ).select();
        insertedItems = (data || []) as TemplateItem[];
      }
      const updatedTemplate: Template = {
        ...selected, name: finalName,
        items: validItems.map((item, i) => ({ ...item, template_id: selected.id, display_order: i, id: insertedItems[i]?.id || item.id || '' })) as TemplateItem[],
      };
      setTemplates((prev: Template[]) => prev.map(t => t.id === selected.id ? updatedTemplate : t));
      setSelected(updatedTemplate);
      setSaving(false);
      setSaved(true);
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editName, editItems]);

  // Resolved dates for the "apply" preview — keyed by item id, populated async.
  const [resolvedDates, setResolvedDates] = useState<Record<string, string | null>>({});
  const [resolvedStartDates, setResolvedStartDates] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (view !== 'apply' || !selected) return;
    let cancelled = false;
    (async () => {
      const items = selected.items.filter(i => !i.parent_item_id);
      const [dueEntries, startEntries] = await Promise.all([
        Promise.all(items.map(async item => [item.id, await resolveItemDate(item, selected.items)] as const)),
        Promise.all(items.map(async item => [item.id, await resolveItemStartDate(item, selected.items)] as const)),
      ]);
      if (!cancelled) {
        setResolvedDates(Object.fromEntries(dueEntries));
        setResolvedStartDates(Object.fromEntries(startEntries));
      }
    })();
    return () => { cancelled = true; };
  }, [view, selected]);

  // Resolved dates for the edit view — keyed by index into editItems (new items have no id yet).
  // Shown as a per-task badge; actual reordering into date order happens on save (see auto-save effect
  // below) rather than live in this list, so a row doesn't jump out from under the field being edited.
  const [editDates, setEditDates] = useState<Record<number, string | null>>({});
  useEffect(() => {
    if (view !== 'edit') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const entries = await Promise.all(editItems.map(async (item, i) => [i, await resolveItemDate(item, editItems)] as const));
      if (!cancelled) setEditDates(Object.fromEntries(entries));
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItems, view]);

  const handleApply = async () => {
    if (!selected || !onApply) return;
    setSaving(true);
    const itemsToApply = selected.items
      .filter(i => !i.parent_item_id)
      .sort((a, b) => a.display_order - b.display_order);

    // Kept as {item, task} pairs (not two separately-sorted arrays) so the
    // due-date reorder below can't desync which template item a created
    // task actually came from -- that correspondence is exactly what
    // dependency resolution after onApply needs.
    const pairs = await Promise.all(itemsToApply.map(async item => ({
      item,
      task: {
        project_id: projectId, name: item.title, notes: item.notes || null,
        assignee_id: item.assignee_id || null, assigned_team_id: item.assigned_team_id || null,
        is_monetary: item.is_monetary || false, estimated_cost: item.estimated_cost || 0,
        start_date: await resolveItemStartDate(item, selected.items),
        due_date: await resolveItemDate(item, selected.items),
        is_completed: false,
      },
    })));
    // Create tasks in due-date order (undated tasks last) rather than the template's raw entry order.
    pairs.sort((a, b) => {
      const ad = a.task.due_date, bd = b.task.due_date;
      if (ad && bd) return ad.localeCompare(bd);
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return 0;
    });

    const created = await onApply(pairs.map(p => p.task));
    if (created && created.length === pairs.length) {
      // Zip template-item ids to the real task ids just created, then
      // resolve each item's depends_on_item_ids into task_dependencies
      // rows -- only meaningful within this same apply (a template's own
      // items refer to each other by their template_item id, not a task
      // id, since no task exists until this exact moment).
      const itemIdToTaskId = new Map(pairs.map((p, i) => [p.item.id, created[i].id]));
      const depRows: { task_id: string; depends_on_task_id: string; company_id: string }[] = [];
      for (const { item } of pairs) {
        const taskId = itemIdToTaskId.get(item.id!);
        if (!taskId || !item.depends_on_item_ids?.length) continue;
        for (const depItemId of item.depends_on_item_ids) {
          const dependsOnTaskId = itemIdToTaskId.get(depItemId);
          if (dependsOnTaskId) depRows.push({ task_id: taskId, depends_on_task_id: dependsOnTaskId, company_id: companyId });
        }
      }
      if (depRows.length) await supabase.from('task_dependencies').insert(depRows);
    }
    setSaving(false);
    onClose?.();
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    if (!window.confirm(`Delete template "${templateName}"? This cannot be undone.`)) return;
    setDeleting(templateId);
    // Delete items first (FK constraint)
    await supabase.from('checklist_template_items').delete().eq('template_id', templateId);
    const { error } = await supabase.from('checklist_templates').delete().eq('id', templateId);
    if (!error) {
      setTemplates((prev: Template[]) => prev.filter(t => t.id !== templateId));
    }
    setDeleting(null);
  };

  const body = (
    <div className={onClose ? "bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-2xl mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden" : "flex flex-col"}>
      {/* Header */}
      <div className="flex items-center gap-3 px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
        {view !== 'list' && (
          <button onClick={() => { setView('list'); setSelected(null); }} className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors">
            <ArrowLeft size={16} />
          </button>
        )}
        <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide flex-1">
          {view === 'list' ? 'Checklist templates' : view === 'apply' ? `Apply: ${selected?.name}` : `Edit: ${selected?.name}`}
        </h3>
        {onClose && <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>}
      </div>

      <div className={onClose ? "flex-1 overflow-y-auto px-8 py-6" : "px-8 py-6"}>
        {/* ── List view ── */}
        {view === 'list' && (
          <div className="space-y-3">
            <button onClick={handleCreateNew} disabled={creating}
              className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-2xl hover:bg-indigo-50 transition-colors text-[12px] font-medium disabled:opacity-40">
              <Plus size={14} /> {creating ? 'Creating...' : 'Create new template'}
            </button>
            {templates.length === 0 && (
              <p className="text-center text-[11px] text-slate-300 italic py-8">No templates yet</p>
            )}
            {templates.map((t: Template) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-4 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition-colors group">
                {/* Apply area (or open-to-edit, outside project context) */}
                <button onClick={() => canApply ? (setSelected(t), setView('apply')) : openEdit(t)} className="flex-1 flex items-center justify-between text-left">
                  <div>
                    <p className="text-[13px] font-bold text-slate-800">{t.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t.items.length} task{t.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  {canApply
                    ? <Copy size={14} className="text-slate-400 shrink-0 ml-3" />
                    : <Pencil size={14} className="text-slate-400 shrink-0 ml-3" />}
                </button>
                {canApply && (
                  <>
                    {/* Divider */}
                    <div className="w-px h-8 bg-slate-200" />
                    {/* Edit */}
                    <button onClick={() => openEdit(t)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors shrink-0" title="Edit template">
                      <Pencil size={14} />
                    </button>
                  </>
                )}
                {/* Divider */}
                <div className="w-px h-8 bg-slate-200" />
                {/* Delete */}
                <button onClick={() => handleDelete(t.id, t.name)} disabled={deleting === t.id}
                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0" title="Delete template">
                  {deleting === t.id
                    ? <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                    : <Trash2 size={15} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Apply view ── */}
        {view === 'apply' && selected && canApply && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500 mb-4">
              The following {selected.items.filter(i => !i.parent_item_id).length} tasks will be created with dates calculated from the project.
            </p>
            {selected.items
              .filter(i => !i.parent_item_id)
              .slice()
              .sort((a, b) => {
                const da = resolvedDates[a.id];
                const db = resolvedDates[b.id];
                if (da && db) return da.localeCompare(db);
                if (da && !db) return -1;
                if (!da && db) return 1;
                return a.display_order - b.display_order;
              })
              .map(item => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3 bg-slate-50 rounded-2xl">
                <CheckSquare size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-slate-800">{item.title}</p>
                  {item.notes && <p className="text-[10px] text-slate-400 mt-0.5">{item.notes}</p>}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {item.start_offset_days != null && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar size={9} /> Start: <span className="font-medium text-indigo-600">{resolvedStartDates[item.id] ?? '—'}</span>
                      </span>
                    )}
                    {item.due_offset_days !== null && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar size={9} />
                        {item.due_offset_days === 0 ? 'On ' : item.due_offset_days > 0 ? `+${item.due_offset_days}d from ` : `${item.due_offset_days}d from `}
                        {ANCHORS.find(a => a.value === item.due_anchor)?.label
                          || (/^task_(\d+)$/.exec(item.due_anchor || '') ? `After: ${selected.items[Number(/^task_(\d+)$/.exec(item.due_anchor || '')![1])]?.title || 'task'}` : item.due_anchor)}
                        {' → '}
                        <span className="font-medium text-indigo-600">{resolvedDates[item.id] ?? '—'}</span>
                        {item.due_offset_mode === 'business' && (
                          <span className="text-slate-300"> ({item.due_offset_state} business days)</span>
                        )}
                      </span>
                    )}
                    {item.assignee_id && (
                      <span className="text-[10px] text-slate-400">
                        {profiles.find((p: any) => p.id === item.assignee_id)?.full_name || ''}
                      </span>
                    )}
                    {item.assigned_team_id && (
                      <span className="text-[10px] text-slate-400">
                        {teams.find((t: any) => t.id === item.assigned_team_id)?.team_name || ''}
                      </span>
                    )}
                    {item.is_monetary && item.estimated_cost > 0 && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <DollarSign size={9} />${Number(item.estimated_cost).toLocaleString()}
                      </span>
                    )}
                    {item.depends_on_item_ids && item.depends_on_item_ids.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        Blocked by: {item.depends_on_item_ids.map(id => selected.items.find(i => i.id === id)?.title).filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Edit view ── */}
        {view === 'edit' && selected && (
          <div className="space-y-6">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Template name</p>
              <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Property Settlement"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tasks</p>
              <div className="space-y-3">
                {editItems.map((item, idx) => (
                  <div key={idx} draggable
                    onDragStart={() => setDraggedIdx(idx)}
                    onDragOver={e => { e.preventDefault(); handleDragOverItem(idx); }}
                    onDrop={e => { e.preventDefault(); setDraggedIdx(null); }}
                    onDragEnd={() => setDraggedIdx(null)}
                    className={`bg-slate-50 rounded-2xl p-4 space-y-3 transition-opacity ${draggedIdx === idx ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      <GripVertical size={14} className="text-slate-300 cursor-grab shrink-0" />
                      <input value={item.title || ''} onChange={e => {
                        const next = [...editItems]; next[idx] = { ...next[idx], title: e.target.value }; setEditItems(next);
                      }} placeholder={`Task ${idx + 1} name...`}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400 bg-white" />
                      <button onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><X size={12} /></button>
                    </div>
                    {editDates[idx] !== undefined && (
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 -mt-1">
                        <Calendar size={9} /> {editDates[idx] ? `Due ${editDates[idx]}` : 'No auto date'}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Offset days</p>
                        <input type="number" value={item.due_offset_days ?? 0} onChange={e => {
                          const next = [...editItems]; next[idx] = { ...next[idx], due_offset_days: parseInt(e.target.value) || 0 }; setEditItems(next);
                        }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white" />
                      </div>
                      <div className="col-span-2">
                        <p className="text-[9px] text-slate-400 mb-1">From</p>
                        <select value={item.due_anchor || 'record_created'} onChange={e => {
                          const next = [...editItems]; next[idx] = { ...next[idx], due_anchor: e.target.value }; setEditItems(next);
                        }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                          {ANCHORS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                          {editItems.map((i, otherIdx) => (
                            otherIdx !== idx && i.title?.trim() && (
                              <option key={`task_${otherIdx}`} value={`task_${otherIdx}`}>After: {i.title}</option>
                            )
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className={`grid gap-2 ${item.due_offset_mode === 'business' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Day type</p>
                        <select value={item.due_offset_mode || 'calendar'} onChange={e => {
                          const next = [...editItems]; next[idx] = { ...next[idx], due_offset_mode: e.target.value as 'calendar' | 'business' }; setEditItems(next);
                        }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                          <option value="calendar">Calendar days</option>
                          <option value="business">Business days</option>
                        </select>
                      </div>
                      {item.due_offset_mode === 'business' && (
                        <div>
                          <p className="text-[9px] text-slate-400 mb-1">State</p>
                          <select value={item.due_offset_state || 'NSW'} onChange={e => {
                            const next = [...editItems]; next[idx] = { ...next[idx], due_offset_state: e.target.value }; setEditItems(next);
                          }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                            {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Start offset days</p>
                        <input type="number" value={item.start_offset_days ?? ''} placeholder="None" onChange={e => {
                          const next = [...editItems];
                          next[idx] = { ...next[idx], start_offset_days: e.target.value === '' ? null : (parseInt(e.target.value) || 0) };
                          setEditItems(next);
                        }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white" />
                      </div>
                      <div className="col-span-2">
                        <p className="text-[9px] text-slate-400 mb-1">Start from</p>
                        <select value={item.start_anchor || 'record_created'} onChange={e => {
                          const next = [...editItems]; next[idx] = { ...next[idx], start_anchor: e.target.value }; setEditItems(next);
                        }} disabled={item.start_offset_days === null || item.start_offset_days === undefined}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white disabled:opacity-40">
                          {ANCHORS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                          {editItems.map((i, otherIdx) => (
                            otherIdx !== idx && i.title?.trim() && (
                              <option key={`task_${otherIdx}`} value={`task_${otherIdx}`}>After due: {i.title}</option>
                            )
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 mb-1">Notes</p>
                      <textarea value={item.notes || ''} onChange={e => {
                        const next = [...editItems]; next[idx] = { ...next[idx], notes: e.target.value || null }; setEditItems(next);
                      }} rows={2} placeholder="Guidance for this task..."
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-2xl text-[11px] outline-none bg-white resize-none" />
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 mb-1">Blocked by</p>
                      <div className="flex flex-wrap gap-1.5">
                        {editItems.map((i, otherIdx) => {
                          if (otherIdx === idx || !i.title?.trim()) return null;
                          const blocked = item.depends_on_item_ids?.includes(i.id || '') || false;
                          return (
                            <button key={otherIdx} type="button" onClick={() => {
                              const next = [...editItems];
                              const curIds = next[idx].depends_on_item_ids || [];
                              const otherId = i.id || '';
                              if (!otherId) return;
                              next[idx] = {
                                ...next[idx],
                                depends_on_item_ids: blocked ? curIds.filter(x => x !== otherId) : [...curIds, otherId],
                              };
                              setEditItems(next);
                            }} disabled={!i.id}
                              className={`px-2.5 py-1 rounded-full text-[10px] border transition-colors disabled:opacity-30 ${
                                blocked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-400 hover:border-indigo-300'
                              }`}>
                              {i.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Assignee</p>
                        <select value={item.assignee_id || ''} onChange={e => {
                          const next = [...editItems]; next[idx] = { ...next[idx], assignee_id: e.target.value || null }; setEditItems(next);
                        }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                          <option value="">Unassigned</option>
                          {profiles.map((p: any) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 mb-1">Team</p>
                        <select value={item.assigned_team_id || ''} onChange={e => {
                          const next = [...editItems]; next[idx] = { ...next[idx], assigned_team_id: e.target.value || null }; setEditItems(next);
                        }} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none bg-white">
                          <option value="">No team</option>
                          {teams.map((t: any) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setEditItems([...editItems, { title: '', due_offset_days: 0, due_anchor: 'record_created', due_offset_mode: 'calendar', display_order: editItems.length }])}
                  className="w-full flex items-center gap-2 justify-center py-2.5 border border-dashed border-slate-300 text-slate-400 rounded-2xl hover:border-indigo-300 hover:text-indigo-600 transition-colors text-[12px]">
                  <Plus size={13} /> Add task
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-8 py-5 border-t border-slate-100 shrink-0">
        {view === 'apply' && canApply && (
          <button onClick={handleApply} disabled={saving}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? 'Creating tasks...' : `Apply template (${selected?.items.filter(i => !i.parent_item_id).length} tasks)`}
          </button>
        )}
        {view === 'edit' && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[11px] text-slate-400 italic">
              {saving ? 'Saving...' : saved ? 'All changes saved' : ''}
            </p>
            <button onClick={() => { setView('list'); setSelected(null); }}
              className="px-6 py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!onClose) return body;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
      {body}
    </div>
  );
}
