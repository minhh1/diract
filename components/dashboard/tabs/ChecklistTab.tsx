// components/dashboard/tabs/ChecklistTab.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, Check, ChevronDown, ChevronRight, Trash2, Calendar,
  User, Users, DollarSign, Pencil, X,
  Copy, CheckSquare, Flag, StickyNote, Mail,
  ArrowRight, Lock,
} from "lucide-react";
import DateCalculator from "@/components/DateCalculator";
import FollowUpToggle, { FollowUpEntry } from "@/components/FollowUpToggle";
import { getDaysLeft } from "@/lib/daysLeft";
import { getRelativeDateLabel } from "@/lib/relativeDate";
import { describeTaskChanges, logTaskActivity } from "@/lib/taskActivityLog";
import { applyChecklistTemplate } from "@/lib/applyChecklistTemplate";
import { splitCompletedByRecency } from "@/lib/completedBucket";
import TaskHistoryTab from "@/components/TaskHistoryTab";
import TemplateManager, { type Template } from "@/components/dashboard/TemplateManager";
import NewRecordModal from "@/components/dashboard/NewRecordModal";
import { createRecord } from "@/lib/services/customTableService";
import { relationCandidates } from "@/lib/dashboardWidgets/linkField";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import type { CustomTable } from "@/lib/hooks/useCustomTables";

interface Task {
  id: string; project_id: string; name: string; is_completed: boolean;
  due_date: string | null; due_time: string | null; assignee_id: string | null;
  assigned_team_id: string | null; status_id: string | null; is_monetary: boolean;
  estimated_cost: number; reminder_settings: any; parent_task_id: string | null;
  date_entered: string | null; company_id: string; created_by: string | null;
  awaiting_follow_up: boolean; follow_up_date: string | null;
  notes: string | null; source_message_id: string | null;
  source_email_subject: string | null; source_email_body: string | null;
  completed_at: string | null;
}
interface Profile { id: string; full_name: string | null; email: string | null; }
interface Team { id: string; team_name: string; }
interface Props { recordId: string; companyId: string; }

// ── TaskRow ────────────────────────────────────────────────────────
function TaskRow({ task, subtasks, allTasks, profiles, teams, depth, followUpsByTask, watchersByTask, onUpdate, onDelete, onAddSubtask, onEdit, onAddFollowUp, onRemoveFollowUp, onMarkFollowUpDone, canLogTimeEntry, onLogTimeEntry, connectedAssigneeIds, onSyncCalendar, syncingTaskId, dependenciesByTask, onNextTask }: any) {
  const [expanded, setExpanded] = useState(true);
  const assignee = profiles.find((p: any) => p.id === task.assignee_id);
  const team = teams.find((t: any) => t.id === task.assigned_team_id);
  const creator = profiles.find((p: any) => p.id === task.created_by);
  const completedSubtasks = subtasks.filter((s: any) => s.is_completed).length;
  const followUps: FollowUpEntry[] = followUpsByTask[task.id] || [];
  const doneFollowUps = followUps.filter(f => f.isDone);
  const scheduledFollowUps = followUps.filter(f => !f.isDone);
  const watchers = ((watchersByTask?.[task.id] || []) as string[])
    .filter(id => id !== task.assignee_id)
    .map(id => profiles.find((p: any) => p.id === id))
    .filter(Boolean);
  // "Cannot happen without" — every prerequisite task_dependencies row must be
  // completed before this task can be marked done (hard-blocked, not just a
  // warning). Deleted prerequisite tasks fall out of `allTasks` and so no
  // longer block anything, matching task_dependencies.sql's comment on
  // soft-deleted rows not being auto-cleaned-up here.
  const blockedBy = ((dependenciesByTask?.[task.id] || []) as string[])
    .map(id => allTasks.find((t: any) => t.id === id))
    .filter((t: any) => t && !t.is_completed);
  const isBlocked = blockedBy.length > 0;
  return (
    <div className={depth > 0 ? 'ml-6 border-l-2 border-slate-100 pl-4' : ''}>
      <div className={`group flex items-start gap-3 py-2.5 px-3 rounded-2xl transition-all hover:bg-slate-50 ${task.is_completed ? 'opacity-60' : ''}`}>
        <button onClick={() => subtasks.length && setExpanded((p: boolean) => !p)} className="mt-0.5 shrink-0 w-4">
          {subtasks.length > 0 ? (expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />) : <span className="w-4" />}
        </button>
        <button onClick={() => { if (!task.is_completed && isBlocked) return; onUpdate(task.id, { is_completed: !task.is_completed }); }}
          disabled={!task.is_completed && isBlocked}
          title={!task.is_completed && isBlocked ? `Blocked by: ${blockedBy.map((t: any) => t.name).join(', ')}` : undefined}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${task.is_completed ? 'bg-emerald-500 border-emerald-500' : isBlocked ? 'border-slate-200 cursor-not-allowed' : 'border-slate-300 hover:border-indigo-400'}`}>
          {task.is_completed && <Check size={11} className="text-white" />}
          {!task.is_completed && isBlocked && <Lock size={9} className="text-slate-300" />}
        </button>
        <div className="mt-0.5 shrink-0">
          <FollowUpToggle
            entries={followUps}
            onAdd={date => onAddFollowUp(task.id, date)}
            onRemove={id => onRemoveFollowUp(task.id, id)}
            onMarkDone={id => onMarkFollowUpDone(task.id, id)}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13px] font-medium ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</span>
            {subtasks.length > 0 && <span className="text-[10px] text-slate-400 font-medium">{completedSubtasks}/{subtasks.length}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {task.due_date && <span className={`flex items-center gap-1 text-[10px] font-medium ${!task.is_completed && new Date(task.due_date) < new Date() ? 'text-orange-600' : 'text-slate-400'}`}><Calendar size={10} />{new Date(task.due_date).toLocaleDateString('en-AU')}{task.due_time && ` ${task.due_time.slice(0,5)}`}</span>}
            {(() => { const dl = getDaysLeft(task.due_date, task.is_completed); return dl ? <span className={`text-[10px] font-bold ${dl.colorClass}`}>{dl.text}</span> : null; })()}
            {assignee && <span className="flex items-center gap-1 text-[10px] text-slate-400"><User size={10} />{assignee.full_name || assignee.email}</span>}
            {watchers.map((w: any) => (
              <span key={w.id} className="flex items-center gap-1 text-[10px] text-violet-500" title="Watcher"><User size={10} />{w.full_name || w.email}</span>
            ))}
            {team && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Users size={10} />{team.team_name}</span>}
            {task.is_monetary && task.estimated_cost > 0 && <span className="flex items-center gap-1 text-[10px] text-slate-400"><DollarSign size={10} />${Number(task.estimated_cost).toLocaleString()}</span>}
            {doneFollowUps.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                <Flag size={10} /> Followed up {doneFollowUps.length}x{task.follow_up_date ? ` · last ${getRelativeDateLabel(task.follow_up_date)}` : ''}
              </span>
            )}
            {scheduledFollowUps.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-sky-600 font-medium">
                📅 Follow-up scheduled {getRelativeDateLabel(scheduledFollowUps[0].followedUpAt)}
              </span>
            )}
            {isBlocked && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium" title={blockedBy.map((t: any) => t.name).join(', ')}>
                <Lock size={10} /> Blocked by {blockedBy.length} task{blockedBy.length !== 1 ? 's' : ''}
              </span>
            )}
            {task.notes && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 italic">
                <StickyNote size={10} /> {task.notes}
              </span>
            )}
            {task.source_email_subject && (
              <button onClick={() => onEdit(task)} title={task.source_email_subject}
                className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 font-medium underline decoration-dotted underline-offset-2">
                <Mail size={10} /> Open email
              </button>
            )}
            {creator && <span className="text-[10px] text-slate-300">Added by {creator.full_name || creator.email}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {canLogTimeEntry && (
            <button onClick={() => onLogTimeEntry(task)} title="Add to Time & Fees" className="p-1.5 text-slate-300 hover:text-emerald-600 transition-colors"><DollarSign size={12} /></button>
          )}
          {task.assignee_id && task.due_date && connectedAssigneeIds?.has(task.assignee_id) && (
            <button onClick={() => onSyncCalendar(task)} disabled={syncingTaskId === task.id} title="Add to calendar"
              className="p-1.5 text-slate-300 hover:text-sky-600 transition-colors disabled:opacity-40"><Calendar size={12} /></button>
          )}
          {!task.is_completed && (
            <button onClick={() => onNextTask(task)} title="Mark done & add next task" className="p-1.5 text-slate-300 hover:text-emerald-600 transition-colors"><ArrowRight size={12} /></button>
          )}
          <button onClick={() => onAddSubtask(task.id)} title="Add subtask" className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors"><Plus size={12} /></button>
          <button onClick={() => onEdit(task)} title="Edit" className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil size={12} /></button>
          <button onClick={() => onDelete(task.id)} title="Delete" className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
        </div>
      </div>
      {expanded && subtasks.length > 0 && (
        <div className="mt-1">
          {subtasks.map((sub: any) => (
            <TaskRow key={sub.id} task={sub} subtasks={allTasks.filter((t: any) => t.parent_task_id === sub.id)} allTasks={allTasks}
              profiles={profiles} teams={teams} depth={depth + 1} followUpsByTask={followUpsByTask} watchersByTask={watchersByTask}
              onUpdate={onUpdate} onDelete={onDelete} onAddSubtask={onAddSubtask} onEdit={onEdit}
              onAddFollowUp={onAddFollowUp} onRemoveFollowUp={onRemoveFollowUp} onMarkFollowUpDone={onMarkFollowUpDone}
              canLogTimeEntry={canLogTimeEntry} onLogTimeEntry={onLogTimeEntry}
              connectedAssigneeIds={connectedAssigneeIds} onSyncCalendar={onSyncCalendar} syncingTaskId={syncingTaskId}
              dependenciesByTask={dependenciesByTask} onNextTask={onNextTask} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaskEditModal ─────────────────────────────────────────────────
function TaskEditModal({ task, profiles, teams, allTasks, dependenciesByTask, onAddDependency, onRemoveDependency, followUps, watcherIds: initWatcherIds, onAddFollowUp, onRemoveFollowUp, onMarkFollowUpDone, onSave, onClose }: any) {
  const [draft, setDraft] = useState<Partial<Task>>({ ...task });
  const [watcherIds, setWatcherIds] = useState<string[]>(initWatcherIds || []);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [addDependencyId, setAddDependencyId] = useState('');
  const set = (patch: Partial<Task>) => setDraft(p => ({ ...p, ...patch }));
  const toggleWatcher = (id: string) => setWatcherIds(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);
  const handleSave = async () => { setSaving(true); await onSave(draft, watcherIds); setSaving(false); onClose(); };
  const dependsOnIds: string[] = task.id ? (dependenciesByTask?.[task.id] || []) : [];
  const dependsOnTasks = dependsOnIds.map(id => (allTasks || []).find((t: any) => t.id === id)).filter(Boolean);
  // Only earlier-created, not-already-linked, other tasks in this project are offerable
  // — deliberately no cycle detection beyond excluding itself (task_dependencies.sql's
  // CHECK constraint blocks self-reference at the DB level too), matching the scope
  // called out when this feature was designed: a simple prerequisite set, not a full
  // DAG editor with cycle prevention.
  const dependencyOptions = (allTasks || []).filter((t: any) => t.id !== task.id && !dependsOnIds.includes(t.id));
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-xl mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">{task.id ? 'Edit task' : 'New task'}</h3>
            {task.id && task.created_by && (() => {
              const creator = profiles.find((p: any) => p.id === task.created_by);
              return creator ? <p className="text-[10px] text-slate-400 mt-1">Added by {creator.full_name || creator.email}</p> : null;
            })()}
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        {task.id && (
          <div className="flex items-center gap-1 px-8 pt-4 shrink-0">
            <button onClick={() => setTab('details')}
              className={`px-4 py-2 text-[11px] font-bold rounded-full transition-colors ${tab === 'details' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}>
              Details
            </button>
            <button onClick={() => setTab('history')}
              className={`px-4 py-2 text-[11px] font-bold rounded-full transition-colors ${tab === 'history' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}>
              History
            </button>
          </div>
        )}
        {tab === 'history' && task.id ? (
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <TaskHistoryTab taskId={task.id} profiles={profiles} />
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Task name *</p>
            <input value={draft.name || ''} onChange={e => set({ name: e.target.value })} placeholder="Enter task name..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Due date</p>
                <DateCalculator onApply={date => set({ due_date: date })} />
              </div>
              <input type="date" value={draft.due_date ? String(draft.due_date).slice(0,10) : ''} onChange={e => set({ due_date: e.target.value || null })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Due time</p>
              <input type="time" value={draft.due_time || ''} onChange={e => set({ due_time: e.target.value || null })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none" />
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assignee</p>
            <select value={draft.assignee_id || ''} onChange={e => set({ assignee_id: e.target.value || null })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
              <option value="">— Unassigned —</option>
              {profiles.map((p: any) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Assigned team</p>
            <select value={draft.assigned_team_id || ''} onChange={e => set({ assigned_team_id: e.target.value || null })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none bg-white">
              <option value="">— No team —</option>
              {teams.map((t: any) => <option key={t.id} value={t.id}>{t.team_name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Watchers <span className="text-slate-300 font-normal normal-case">(also notified, shown on their task list)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {profiles.map((p: any) => {
                const active = watcherIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleWatcher(p.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${active ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300'}`}>
                    {p.full_name || p.email}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => set({ is_monetary: !draft.is_monetary })}
                className={`w-10 h-6 rounded-full transition-colors ${draft.is_monetary ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${draft.is_monetary ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[12px] text-slate-700 font-medium">Monetary task</span>
            </label>
            {draft.is_monetary && (
              <div className="mt-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estimated cost</p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[13px]">$</span>
                  <input type="number" value={draft.estimated_cost || 0} onChange={e => set({ estimated_cost: parseFloat(e.target.value) || 0 })}
                    className="flex-1 px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none" />
                </div>
              </div>
            )}
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Reminder</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 mb-1">Days before</p>
                <input type="number" min="0" value={draft.reminder_settings?.days ?? 0}
                  onChange={e => set({ reminder_settings: { ...draft.reminder_settings, days: parseInt(e.target.value) || 0 } })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-1">At time</p>
                <input type="time" value={draft.reminder_settings?.time ?? '09:00'}
                  onChange={e => set({ reminder_settings: { ...draft.reminder_settings, time: e.target.value } })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none" />
              </div>
            </div>
          </div>
          {task.id && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Follow-ups</p>
              <div className="flex items-center gap-2">
                <FollowUpToggle
                  entries={followUps}
                  onAdd={(date: string) => onAddFollowUp(task.id, date)}
                  onRemove={(id: string) => onRemoveFollowUp(task.id, id)}
                  onMarkDone={(id: string) => onMarkFollowUpDone(task.id, id)}
                />
                <span className="text-[12px] text-slate-500">
                  {(() => {
                    const done = followUps.filter((f: FollowUpEntry) => f.isDone).length;
                    const scheduled = followUps.length - done;
                    if (!followUps.length) return 'Not followed up yet';
                    return `Followed up ${done} time${done !== 1 ? 's' : ''}` + (scheduled ? ` · ${scheduled} scheduled` : '');
                  })()}
                </span>
              </div>
            </div>
          )}
          {task.id && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Depends on <span className="text-slate-300 font-normal normal-case">(can't be marked done until these are)</span>
              </p>
              <div className="space-y-1.5 mb-2">
                {dependsOnTasks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-full">
                    <span className={`text-[12px] font-medium truncate ${t.is_completed ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {t.is_completed && <Check size={11} className="inline mr-1" />}{t.name}
                    </span>
                    <button onClick={() => onRemoveDependency(task.id, t.id)} className="p-1 text-slate-300 hover:text-red-500 shrink-0"><X size={12} /></button>
                  </div>
                ))}
                {!dependsOnTasks.length && <p className="text-[11px] text-slate-300 italic">No prerequisites</p>}
              </div>
              {!!dependencyOptions.length && (
                <div className="flex items-center gap-2">
                  <select value={addDependencyId} onChange={e => setAddDependencyId(e.target.value)}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none bg-white">
                    <option value="">— Select a task —</option>
                    {dependencyOptions.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => { if (!addDependencyId) return; onAddDependency(task.id, addDependencyId); setAddDependencyId(''); }}
                    disabled={!addDependencyId}
                    className="px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full disabled:opacity-40 transition-colors">
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Notes</p>
            <textarea value={draft.notes || ''} onChange={e => set({ notes: e.target.value || null })} rows={3} placeholder="Add a note..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[13px] outline-none focus:border-indigo-400 resize-none" />
          </div>
          {task.source_email_subject && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Reference email</p>
              <div className="border border-slate-200 rounded-2xl px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] text-slate-700 font-semibold">
                  <Mail size={12} className="shrink-0 text-indigo-500" /> {task.source_email_subject}
                </p>
                {task.source_email_body && (
                  <p className="text-[11px] text-slate-500 mt-1.5 whitespace-pre-wrap max-h-40 overflow-y-auto">{task.source_email_body}</p>
                )}
              </div>
            </div>
          )}
        </div>
        )}
        {tab === 'details' && (
        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={handleSave} disabled={saving || !draft.name?.trim()}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? 'Saving...' : task.id ? 'Save changes' : 'Add task'}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

// ── ChecklistTab (main) ────────────────────────────────────────────
export default function ChecklistTab({ recordId, companyId }: Props) {
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [followUpsByTask, setFollowUpsByTask] = useState<Record<string, FollowUpEntry[]>>({});
  const [watchersByTask, setWatchersByTask] = useState<Record<string, string[]>>({});
  const [profiles, setProfiles]         = useState<Profile[]>([]);
  const [teams, setTeams]               = useState<Team[]>([]);
  const [templates, setTemplates]       = useState<Template[]>([]);
  const [project, setProject]           = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [editingTask, setEditingTask]   = useState<Partial<Task> | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCompletedThisWeek, setShowCompletedThisWeek] = useState(false);
  const [showCompletedOlder, setShowCompletedOlder] = useState(false);
  // Time & Fee Entries is a law-firm-only custom table (installed from the Law Firm
  // template, slug 'time-fee-entries') — most companies won't have it at all, in which
  // case timeFeesTable stays null and the per-task "Add to Time & Fees" action is hidden
  // entirely rather than shown disabled.
  const [timeFeesTable, setTimeFeesTable] = useState<CustomTable | null>(null);
  const [timeFeesFields, setTimeFeesFields] = useState<CustomTableField[]>([]);
  const [convertingTask, setConvertingTask] = useState<Task | null>(null);
  // Users in this company with a connected Gmail/Calendar account (see
  // company_gmail_connections — a view bypassing user_gmail_tokens' own-row-only RLS,
  // scoped to the caller's company). Drives whether the per-task "Add to calendar"
  // action shows at all: only when that task's assignee has a calendar to add it to.
  const [connectedAssigneeIds, setConnectedAssigneeIds] = useState<Set<string>>(new Set());
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  // taskId -> ids of tasks it depends on (task_dependencies.task_id = this task,
  // .depends_on_task_id = the prerequisite) — AND semantics, every one must be
  // completed before this task can be. See task_dependencies.sql.
  const [dependenciesByTask, setDependenciesByTask] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: taskData }, { data: profileData }, { data: teamData },
      { data: templateData }, { data: projectData }, { data: timeFeesTableData },
      { data: gmailConnections },
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('project_id', recordId).is('deleted_at', null).order('date_entered'),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('teams').select('id, team_name').eq('is_active', true),
      supabase.from('checklist_templates').select('*, items:checklist_template_items(*)').eq('company_id', companyId).order('created_at'),
      supabase.from('projects').select('created_at, estimated_completion_date').eq('id', recordId).single(),
      supabase.from('company_tables').select('*').eq('slug', 'time-fee-entries').is('deleted_at', null).maybeSingle(),
      supabase.from('company_gmail_connections').select('user_id'),
    ]);
    setTasks(taskData || []);
    setProfiles(profileData || []);
    setTeams(teamData || []);
    setProject(projectData);
    setConnectedAssigneeIds(new Set((gmailConnections || []).map((c: any) => c.user_id)));
    setTemplates((templateData || []).map((t: any) => ({
      ...t, items: (t.items || []).sort((a: any, b: any) => a.display_order - b.display_order),
    })));
    setTimeFeesTable(timeFeesTableData || null);
    if (timeFeesTableData) {
      const { data: fieldData } = await supabase
        .from('company_table_fields').select('*')
        .eq('table_id', timeFeesTableData.id).is('deleted_at', null).order('display_order');
      setTimeFeesFields(fieldData || []);
    } else {
      setTimeFeesFields([]);
    }

    const taskIds = (taskData || []).map((t: any) => t.id);
    if (taskIds.length) {
      const [{ data: followUpData }, { data: watcherData }, { data: dependencyData }] = await Promise.all([
        supabase.from('task_follow_ups').select('id, task_id, followed_up_at, is_done').in('task_id', taskIds),
        supabase.from('task_watchers').select('task_id, profile_id').in('task_id', taskIds),
        supabase.from('task_dependencies').select('task_id, depends_on_task_id').in('task_id', taskIds),
      ]);
      const grouped: Record<string, FollowUpEntry[]> = {};
      for (const f of followUpData || []) {
        (grouped[f.task_id] ||= []).push({ id: f.id, followedUpAt: f.followed_up_at, isDone: f.is_done });
      }
      setFollowUpsByTask(grouped);
      const watcherGroups: Record<string, string[]> = {};
      for (const w of watcherData || []) {
        (watcherGroups[w.task_id] ||= []).push(w.profile_id);
      }
      setWatchersByTask(watcherGroups);
      const dependencyGroups: Record<string, string[]> = {};
      for (const d of dependencyData || []) {
        (dependencyGroups[d.task_id] ||= []).push(d.depends_on_task_id);
      }
      setDependenciesByTask(dependencyGroups);
    } else {
      setFollowUpsByTask({});
      setWatchersByTask({});
      setDependenciesByTask({});
    }

    setLoading(false);
  }, [recordId, companyId]);

  useEffect(() => { load(); }, [load]);

  const handleAddTask = (parentId?: string) => {
    setEditingTask({ project_id: recordId, company_id: companyId, parent_task_id: parentId || null, is_completed: false, is_monetary: false, estimated_cost: 0, due_time: '09:00', reminder_settings: { days: 0, time: '09:00' } });
  };

  // Single project-relation field on Time & Fee Entries (see relationCandidates'
  // convention — the same one RecordDashboardTab auto-detects a matter field by).
  // description is matched by field_key rather than auto-detected since text fields
  // aren't uniquely typed; if a company renamed/removed it, the entry still opens
  // with the matter locked in, just without a prefilled/AI-rewritable description.
  const timeFeesMatterFieldKey = relationCandidates(timeFeesFields, 'projects')[0]?.field_key;
  const timeFeesDescriptionFieldKey = timeFeesFields.find(f => f.field_key === 'description')?.field_key;
  // Invoice is assigned during billing, not when logging the entry — never asked for here.
  const timeEntryFields = timeFeesFields.filter(f => f.field_key !== 'invoice');

  const handleCreateTimeEntry = async (values: Record<string, any>): Promise<string | null> => {
    if (!timeFeesTable) return 'Time & Fee Entries table not found.';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Not signed in.';
    const rec = await createRecord(timeFeesTable.id, companyId, user.id, values, timeEntryFields);
    if (rec && 'error' in rec) return rec.error;
    if (rec) { setConvertingTask(null); return null; }
    return 'Could not create the record.';
  };

  // Fires the same calendar-sync edge function the public tasks page and Gmail Add-on
  // already trigger on save — ChecklistTab itself never does, so this is the only way a
  // task edited from the main dashboard gets pushed to the assignee's calendar. The
  // event title uses whatever format the company has configured (Settings -> Calendar
  // sync), not anything decided here.
  const handleSyncCalendar = async (task: Task) => {
    setSyncingTaskId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}/sync-calendar`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || 'Failed to add to calendar');
      }
    } finally {
      setSyncingTaskId(null);
    }
  };

  const saveWatchers = async (taskId: string, newIds: string[], oldIds: string[], actorId: string | null) => {
    const added = newIds.filter(id => !oldIds.includes(id));
    const removed = oldIds.filter(id => !newIds.includes(id));
    if (!added.length && !removed.length) return;
    if (removed.length) {
      await supabase.from('task_watchers').delete().eq('task_id', taskId).in('profile_id', removed);
    }
    if (added.length) {
      await supabase.from('task_watchers').insert(added.map(profile_id => ({ task_id: taskId, company_id: companyId, profile_id, created_by: actorId })));
    }
    setWatchersByTask(prev => ({ ...prev, [taskId]: newIds }));
    const nameFor = (id: string) => profiles.find(p => p.id === id)?.full_name || profiles.find(p => p.id === id)?.email || 'someone';
    const detail = [
      added.length ? `+watcher ${added.map(nameFor).join(', ')}` : null,
      removed.length ? `-watcher ${removed.map(nameFor).join(', ')}` : null,
    ].filter(Boolean).join(', ');
    if (detail) logTaskActivity(supabase, { taskId, companyId, actorId, action: 'updated', detail });
  };

  const handleSaveTask = async (draft: Partial<Task>, watcherIds: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (draft.id) {
      const { id, ...rest } = draft;
      await supabase.from('tasks').update(rest).eq('id', id);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...rest } : t));
      const changes = describeTaskChanges(editingTask || {}, rest, { profiles, teams });
      if (changes.length) {
        logTaskActivity(supabase, { taskId: id, companyId, actorId: user?.id || null, action: 'updated', detail: changes.join(', ') });
      }
      await saveWatchers(id, watcherIds, watchersByTask[id] || [], user?.id || null);
    } else {
      // _pendingDependencyOn is set by handleNextTask -- an internal marker, not a
      // real tasks column, stripped before insert and consumed right after to link
      // this brand-new task back to the one that was just marked done.
      const { _pendingDependencyOn, ...insertPayload } = draft as any;
      const { data } = await supabase.from('tasks').insert({
        ...insertPayload,
        created_by: user?.id,
        date_entered: new Date().toISOString().split('T')[0],
      }).select().single();
      if (data) {
        setTasks(prev => [...prev, data]);
        logTaskActivity(supabase, { taskId: data.id, companyId, actorId: user?.id || null, action: 'created' });
        await saveWatchers(data.id, watcherIds, [], user?.id || null);
        if (_pendingDependencyOn) await handleAddDependency(data.id, _pendingDependencyOn);
      }
    }
  };

  const handleAddDependency = async (taskId: string, dependsOnTaskId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('task_dependencies')
      .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId, company_id: companyId, created_by: user?.id || null });
    if (!error) {
      setDependenciesByTask(prev => ({ ...prev, [taskId]: [...new Set([...(prev[taskId] || []), dependsOnTaskId])] }));
    }
  };

  const handleRemoveDependency = async (taskId: string, dependsOnTaskId: string) => {
    await supabase.from('task_dependencies').delete().eq('task_id', taskId).eq('depends_on_task_id', dependsOnTaskId);
    setDependenciesByTask(prev => ({ ...prev, [taskId]: (prev[taskId] || []).filter(id => id !== dependsOnTaskId) }));
  };

  // "Next task": marks the current task done, then opens the new-task form
  // prefilled to become a dependent of it once saved (handleSaveTask consumes
  // _pendingDependencyOn above) -- the one-click "finish this, queue the next
  // step in the chain" action.
  const handleNextTask = (task: Task) => {
    handleUpdate(task.id, { is_completed: true });
    setEditingTask({
      project_id: recordId, company_id: companyId, parent_task_id: task.parent_task_id || null,
      is_completed: false, is_monetary: false, estimated_cost: 0, due_time: '09:00',
      reminder_settings: { days: 0, time: '09:00' },
      _pendingDependencyOn: task.id,
    } as any);
  };

  const handleUpdate = async (id: string, patch: Partial<Task>) => {
    // completed_at is set server-side by a DB trigger keyed off is_completed —
    // mirror that locally so the completed-this-week/older split is correct
    // immediately, without waiting for a refetch.
    const localPatch = 'is_completed' in patch
      ? { ...patch, completed_at: patch.is_completed ? new Date().toISOString() : null }
      : patch;
    await supabase.from('tasks').update(patch).eq('id', id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...localPatch } : t));
    const { data: { user } } = await supabase.auth.getUser();
    const actorId = user?.id || null;
    if ('is_completed' in patch) {
      logTaskActivity(supabase, { taskId: id, companyId, actorId, action: patch.is_completed ? 'completed' : 'reopened' });
    } else {
      const existing = tasks.find(t => t.id === id);
      const changes = describeTaskChanges(existing || {}, patch, { profiles, teams });
      if (changes.length) logTaskActivity(supabase, { taskId: id, companyId, actorId, action: 'updated', detail: changes.join(', ') });
    }
  };

  // A task can be followed up more than once — each log entry is its own
  // row; awaiting_follow_up/follow_up_date on the task itself are kept as a
  // denormalized "latest state" cache so status badges elsewhere don't need
  // to know about the log table. Both actions update local state immediately
  // (optimistic) and fire the writes in the background so the tick doesn't
  // feel laggy.
  const applyFollowUpCacheLocally = (taskId: string, entries: FollowUpEntry[]) => {
    const done = entries.filter(e => e.isDone);
    const latest = done.length ? done.reduce((a, b) => (a.followedUpAt > b.followedUpAt ? a : b)) : null;
    const patch = { awaiting_follow_up: done.length > 0, follow_up_date: latest?.followedUpAt || null };
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
    return patch;
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const handleAddFollowUp = (taskId: string, date: string) => {
    const isDone = date <= todayStr();
    const tempId = `temp-${Date.now()}`;
    const next = [...(followUpsByTask[taskId] || []), { id: tempId, followedUpAt: date, isDone }];
    setFollowUpsByTask(prev => ({ ...prev, [taskId]: next }));
    const patch = applyFollowUpCacheLocally(taskId, next);

    // A future follow-up date is effectively a rescheduled due date — move
    // it along so the task doesn't keep showing as due before then.
    if (!isDone) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: date } : t));

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('task_follow_ups').insert({
        task_id: taskId, company_id: companyId, followed_up_at: date, is_done: isDone, created_by: user?.id,
      }).select().single();
      if (error || !data) {
        setFollowUpsByTask(prev => ({ ...prev, [taskId]: (prev[taskId] || []).filter(f => f.id !== tempId) }));
        return;
      }
      setFollowUpsByTask(prev => ({
        ...prev,
        [taskId]: (prev[taskId] || []).map(f => f.id === tempId ? { id: data.id, followedUpAt: data.followed_up_at, isDone: data.is_done } : f),
      }));
      supabase.from('tasks').update(patch).eq('id', taskId);
      if (!isDone) supabase.from('tasks').update({ due_date: date }).eq('id', taskId);
      logTaskActivity(supabase, {
        taskId, companyId, actorId: user?.id || null,
        action: 'follow_up_set',
        detail: isDone ? `follow-up date: ${date}` : `follow-up scheduled: ${date} (due date moved to match)`,
      });
    })();
  };

  const handleRemoveFollowUp = (taskId: string, followUpId: string) => {
    const next = (followUpsByTask[taskId] || []).filter(f => f.id !== followUpId);
    setFollowUpsByTask(prev => ({ ...prev, [taskId]: next }));
    const patch = applyFollowUpCacheLocally(taskId, next);

    (async () => {
      await supabase.from('task_follow_ups').delete().eq('id', followUpId);
      await supabase.from('tasks').update(patch).eq('id', taskId);
      const { data: { user } } = await supabase.auth.getUser();
      logTaskActivity(supabase, { taskId, companyId, actorId: user?.id || null, action: 'follow_up_cleared' });
    })();
  };

  const handleMarkFollowUpDone = (taskId: string, followUpId: string) => {
    const next = (followUpsByTask[taskId] || []).map(f => f.id === followUpId ? { ...f, isDone: true } : f);
    setFollowUpsByTask(prev => ({ ...prev, [taskId]: next }));
    const patch = applyFollowUpCacheLocally(taskId, next);

    (async () => {
      await supabase.from('task_follow_ups').update({ is_done: true }).eq('id', followUpId);
      await supabase.from('tasks').update(patch).eq('id', taskId);
      const { data: { user } } = await supabase.auth.getUser();
      logTaskActivity(supabase, { taskId, companyId, actorId: user?.id || null, action: 'follow_up_set', detail: 'scheduled follow-up marked done' });
    })();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
    const { data: { user } } = await supabase.auth.getUser();
    logTaskActivity(supabase, { taskId: id, companyId, actorId: user?.id || null, action: 'deleted' });
  };

  const handleApplyTemplate = async (tasksToCreate: Partial<Task>[]): Promise<{ id: string }[]> => {
    if (!tasksToCreate.length) return [];
    const { data: { user } } = await supabase.auth.getUser();
    let created: { id: string }[];
    try {
      created = await applyChecklistTemplate(supabase, tasksToCreate, user?.id || null);
    } catch (err) {
      console.error('[apply] Insert error:', err);
      alert(`Failed to apply template: ${err instanceof Error ? err.message : 'unknown error'}`);
      return [];
    }
    setTasks(prev => [...prev, ...(created as Task[])]);
    for (const t of created) {
      logTaskActivity(supabase, { taskId: t.id, companyId, actorId: user?.id || null, action: 'created', detail: 'via template' });
    }
    return created;
  };

  const handleCreateTemplate = async (name: string): Promise<Template | null> => {
    const { data: tpl } = await supabase.from('checklist_templates').insert({ company_id: companyId, name, record_table: 'projects' }).select().single();
    if (!tpl) return null;
    const newTemplate: Template = { id: tpl.id, name: tpl.name, items: [] };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  };

  const rootTasks = tasks.filter(t => !t.parent_task_id);
  const activeTasks = rootTasks.filter(t => !t.is_completed);
  const completedTasks = rootTasks.filter(t => t.is_completed);
  const { thisWeek: completedThisWeek, older: completedOlder } = splitCompletedByRecency(completedTasks, t => t.completed_at);
  const totalCost = tasks.filter(t => t.is_monetary).reduce((s, t) => s + (t.estimated_cost || 0), 0);
  const completedCount = tasks.filter(t => t.is_completed).length;
  const progress = tasks.length ? Math.round(completedCount / tasks.length * 100) : 0;

  if (loading) return <p className="text-[11px] text-slate-400 text-center py-8">Loading checklist...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[11px] font-bold text-slate-700">{completedCount}/{tasks.length} tasks</p>
            <div className="mt-1 w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          {totalCost > 0 && <div className="text-[11px] text-slate-500"><DollarSign size={11} className="inline" />{totalCost.toLocaleString()} est.</div>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-slate-500 font-medium border border-slate-200 rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors">
            <Copy size={12} /> Templates {templates.length > 0 && <span className="ml-0.5 text-slate-400">({templates.length})</span>}
          </button>
          <button onClick={() => handleAddTask()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
            <Plus size={13} /> Add task
          </button>
        </div>
      </div>

      {/* Empty state */}
      {activeTasks.length === 0 && completedTasks.length === 0 && (
        <div className="text-center py-16">
          <CheckSquare size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest mb-3">No tasks yet</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => handleAddTask()} className="px-5 py-2.5 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-colors">Add first task</button>
            {templates.length > 0 && (
              <button onClick={() => setShowTemplates(true)} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-colors">Apply template</button>
            )}
          </div>
        </div>
      )}

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <div className="space-y-1">
          {activeTasks.map(task => (
            <TaskRow key={task.id} task={task} subtasks={tasks.filter(t => t.parent_task_id === task.id)}
              allTasks={tasks} profiles={profiles} teams={teams} depth={0} followUpsByTask={followUpsByTask} watchersByTask={watchersByTask}
              onUpdate={handleUpdate} onDelete={handleDelete} onAddSubtask={handleAddTask} onEdit={(t: Task) => setEditingTask(t)}
              onAddFollowUp={handleAddFollowUp} onRemoveFollowUp={handleRemoveFollowUp} onMarkFollowUpDone={handleMarkFollowUpDone}
              canLogTimeEntry={!!timeFeesTable} onLogTimeEntry={(t: Task) => setConvertingTask(t)}
              connectedAssigneeIds={connectedAssigneeIds} onSyncCalendar={handleSyncCalendar} syncingTaskId={syncingTaskId}
              dependenciesByTask={dependenciesByTask} onNextTask={handleNextTask} />
          ))}
        </div>
      )}

      {/* Completed this week */}
      {completedThisWeek.length > 0 && (
        <div>
          <button onClick={() => setShowCompletedThisWeek(p => !p)} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            {showCompletedThisWeek ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Completed this week ({completedThisWeek.length})
          </button>
          {showCompletedThisWeek && (
            <div className="space-y-1 opacity-70">
              {completedThisWeek.map(task => (
                <TaskRow key={task.id} task={task} subtasks={tasks.filter(t => t.parent_task_id === task.id)}
                  allTasks={tasks} profiles={profiles} teams={teams} depth={0} followUpsByTask={followUpsByTask} watchersByTask={watchersByTask}
                  onUpdate={handleUpdate} onDelete={handleDelete} onAddSubtask={handleAddTask} onEdit={(t: Task) => setEditingTask(t)}
                  onAddFollowUp={handleAddFollowUp} onRemoveFollowUp={handleRemoveFollowUp} onMarkFollowUpDone={handleMarkFollowUpDone}
                  canLogTimeEntry={!!timeFeesTable} onLogTimeEntry={(t: Task) => setConvertingTask(t)}
                  connectedAssigneeIds={connectedAssigneeIds} onSyncCalendar={handleSyncCalendar} syncingTaskId={syncingTaskId}
                  dependenciesByTask={dependenciesByTask} onNextTask={handleNextTask} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed older */}
      {completedOlder.length > 0 && (
        <div>
          <button onClick={() => setShowCompletedOlder(p => !p)} className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            {showCompletedOlder ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Completed older ({completedOlder.length})
          </button>
          {showCompletedOlder && (
            <div className="space-y-1 opacity-70">
              {completedOlder.map(task => (
                <TaskRow key={task.id} task={task} subtasks={tasks.filter(t => t.parent_task_id === task.id)}
                  allTasks={tasks} profiles={profiles} teams={teams} depth={0} followUpsByTask={followUpsByTask} watchersByTask={watchersByTask}
                  onUpdate={handleUpdate} onDelete={handleDelete} onAddSubtask={handleAddTask} onEdit={(t: Task) => setEditingTask(t)}
                  onAddFollowUp={handleAddFollowUp} onRemoveFollowUp={handleRemoveFollowUp} onMarkFollowUpDone={handleMarkFollowUpDone}
                  canLogTimeEntry={!!timeFeesTable} onLogTimeEntry={(t: Task) => setConvertingTask(t)}
                  connectedAssigneeIds={connectedAssigneeIds} onSyncCalendar={handleSyncCalendar} syncingTaskId={syncingTaskId}
                  dependenciesByTask={dependenciesByTask} onNextTask={handleNextTask} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {editingTask && (
        <TaskEditModal task={editingTask} profiles={profiles} teams={teams}
          allTasks={tasks} dependenciesByTask={dependenciesByTask} onAddDependency={handleAddDependency} onRemoveDependency={handleRemoveDependency}
          followUps={editingTask.id ? (followUpsByTask[editingTask.id] || []) : []}
          watcherIds={editingTask.id ? (watchersByTask[editingTask.id] || []) : []}
          onAddFollowUp={handleAddFollowUp} onRemoveFollowUp={handleRemoveFollowUp} onMarkFollowUpDone={handleMarkFollowUpDone}
          companyId={companyId} projectId={recordId} onSave={handleSaveTask} onClose={() => setEditingTask(null)} />
      )}
      {showTemplates && (
        <TemplateManager
          templates={templates}
          setTemplates={setTemplates}
          profiles={profiles} teams={teams} companyId={companyId} projectId={recordId}
          projectCreatedAt={project?.created_at || new Date().toISOString()}
          projectDueDate={project?.estimated_completion_date || null}
          onApply={handleApplyTemplate} onCreateTemplate={handleCreateTemplate}
          onClose={() => { setShowTemplates(false); }}
        />
      )}
      {convertingTask && timeFeesTable && (
        <NewRecordModal
          tableName={timeFeesTable.name}
          fields={timeEntryFields}
          initialValues={{
            ...(timeFeesMatterFieldKey ? { [timeFeesMatterFieldKey]: recordId } : {}),
            ...(timeFeesDescriptionFieldKey ? { [timeFeesDescriptionFieldKey]: convertingTask.notes || convertingTask.name } : {}),
          }}
          aiRewriteFieldKey={timeFeesDescriptionFieldKey}
          onCreate={handleCreateTimeEntry}
          onClose={() => setConvertingTask(null)}
        />
      )}
    </div>
  );
}