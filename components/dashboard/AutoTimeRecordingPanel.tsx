"use client";

// The actual drawer AutoTimeRecordingButtonWidget opens. Drafts Time & Fee
// Entries from a chosen day's completed tasks + matter-linked emails (see
// app/api/time-entries/auto-generate), lets the viewer tick which ones to
// keep and adjust description/hours inline, then submits the checked ones
// as real, Released entries (app/api/time-entries/submit) -- each becomes a
// row a professional would recognize from an actual timesheet: timekeeper,
// date, matter, description, time spent.
//
// A company admin gets a "My day" / "Everyone's day (Admin)" toggle in the
// same panel rather than a separate screen -- switching to "Everyone's"
// re-generates against every staff member's tasks/emails for that day
// instead of just the viewer's own, and Timekeeper becomes a meaningful
// column instead of always reading the same person. Whichever list (an
// admin's "Everyone's day" or a user's own "My day") someone submits an
// entry from first wins it -- the OTHER view simply won't offer it again on
// its next generate, since both read the same time_entry_ai_sources
// tracking table server-side (see the submit route's header comment).
import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Sparkles, Check, RefreshCw, ChevronDown, ChevronUp, Mail, Star } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { supabase } from "@/lib/supabase";
import type { DescriptionDetailLevel } from "@/lib/ai/autoTimeEntryDraft";

const DETAIL_LEVELS: DescriptionDetailLevel[] = ["brief", "standard", "detailed"];

interface DraftEntry {
  key: string;
  // null for an email attribution couldn't resolve to anyone (see
  // lib/ai/emailTimekeeperAttribution.ts) -- only ever appears in the admin
  // "everyone's day" scope; the admin picks who it belongs to below before
  // it can be checked/submitted.
  userId: string | null;
  userInitials: string;
  userName: string | null;
  matterId: string;
  matterLabel: string;
  description: string;
  hours: number;
  date: string;
  sourceTaskIds: string[];
  sourceEmailIds: string[];
  // The actual email(s) this entry's description was drafted from -- shown
  // via an inline expand (see expandedKeys below) so the viewer can check
  // the AI's read of the correspondence without leaving this drawer.
  emailPreviews: { subject: string | null; snippet: string | null; fromName: string | null }[];
  // How much this entry's description currently says -- starts at whatever
  // level the batch generate() call used (see defaultDetailLevel below),
  // changed per-entry via the Brief/Standard/Detailed control, which
  // re-drafts just this entry's description (never its matter/hours/
  // attribution) from the same sourceTaskIds/sourceEmailIds.
  detailLevel: DescriptionDetailLevel;
}

interface StaffOption { userId: string; name: string; initials: string; }

const todayInputValue = () => new Date().toISOString().slice(0, 10);

interface Props {
  label: string;
  isAdmin: boolean;
  onClose: () => void;
  // See AutoTimeRecordingButtonWidget's own doc comment.
  onDataChanged?: () => void;
}

export default function AutoTimeRecordingPanel({ label, isAdmin, onClose, onDataChanged }: Props) {
  const { tableLabelOverrides, userId } = useCompany();
  const matterLabel = tableLabelOverrides.projects?.singular || "Matter";

  const [date, setDate] = useState(todayInputValue());
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedNotes, setFailedNotes] = useState<Record<string, string>>({});
  // null until the user's persisted preference loads -- generate() waits
  // for it rather than firing once with a hardcoded 'standard' and again a
  // moment later once the real default is known.
  const [defaultDetailLevel, setDefaultDetailLevel] = useState<DescriptionDetailLevel | null>(null);
  // Per-entry description regenerate in flight -- disables that entry's
  // detail-level buttons so a second click can't fire while one's pending.
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  // Which level the toolbar's own Brief/Standard/Detailed control last
  // applied to every entry at once -- purely a UI highlight, separate from
  // defaultDetailLevel (the persisted per-user preference future Generate
  // runs start from). Clicking here doesn't change that preference; only
  // an entry's own "Set as default" does.
  const [bulkLevel, setBulkLevel] = useState<DescriptionDetailLevel>("standard");
  const [bulkRegenerating, setBulkRegenerating] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("auto_time_entry_detail_level").eq("id", userId).single()
      .then(({ data }) => {
        const level = (data?.auto_time_entry_detail_level as DescriptionDetailLevel) || "standard";
        setDefaultDetailLevel(level);
        setBulkLevel(level);
      });
  }, [userId]);
  // Which entries currently have their source email(s) expanded open --
  // purely a display toggle, inline within this same drawer (never
  // navigates anywhere).
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) => setExpandedKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const generate = useCallback(async () => {
    if (!defaultDetailLevel) return; // still waiting on the profile fetch above
    setLoading(true);
    setError(null);
    setFailedNotes({});
    try {
      const res = await fetch("/api/time-entries/auto-generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, scope, detailLevel: defaultDetailLevel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate time entries");
      const rows: DraftEntry[] = json.entries || [];
      setEntries(rows);
      setStaffOptions(json.staffOptions || []);
      // Rows with no timekeeper resolved yet start unchecked -- there's
      // nothing valid to submit until one is assigned below.
      setChecked(new Set(rows.filter(r => r.userId).map(r => r.key)));
      setBulkLevel(defaultDetailLevel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate time entries");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [date, scope, defaultDetailLevel]);

  useEffect(() => { generate(); }, [generate]);

  const toggleOne = (key: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const assignableEntries = entries.filter(e => e.userId);
  const allChecked = assignableEntries.length > 0 && assignableEntries.every(e => checked.has(e.key));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(assignableEntries.map(e => e.key)));

  const updateEntry = (key: string, patch: Partial<DraftEntry>) =>
    setEntries(prev => prev.map(e => e.key === key ? { ...e, ...patch } : e));

  // Re-drafts just this one entry's description at a different detail
  // level -- matter/hours/sources/attribution are untouched, only the
  // description text changes (see the regenerate-description route's own
  // header comment for why this is a separate endpoint from the batch
  // generate above).
  const regenerateDescription = async (key: string, level: DescriptionDetailLevel) => {
    const entry = entries.find(e => e.key === key);
    if (!entry || regeneratingKeys.has(key)) return;
    updateEntry(key, { detailLevel: level });
    setRegeneratingKeys(prev => new Set(prev).add(key));
    try {
      const res = await fetch("/api/time-entries/auto-generate/regenerate-description", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTaskIds: entry.sourceTaskIds, sourceEmailIds: entry.sourceEmailIds, detailLevel: level }),
      });
      const json = await res.json();
      if (res.ok && json.description) updateEntry(key, { description: json.description });
    } catch {
      // Leave the existing description in place on failure -- the level
      // toggle already reflects the attempted choice either way.
    } finally {
      setRegeneratingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // Toolbar version of the same control -- applies one level to every
  // entry currently on screen at once (each via the same per-entry
  // regenerateDescription above, so matter/hours/attribution/checked state
  // all stay untouched), rather than clicking through them one at a time.
  // Ephemeral like the per-entry control: doesn't change
  // defaultDetailLevel, only an entry's own "Set as default" does that.
  const regenerateAllDescriptions = async (level: DescriptionDetailLevel) => {
    if (bulkRegenerating || !entries.length) return;
    setBulkLevel(level);
    setBulkRegenerating(true);
    try {
      await Promise.all(entries.map(e => regenerateDescription(e.key, level)));
    } finally {
      setBulkRegenerating(false);
    }
  };

  // Persists this level as the viewer's own default for future "Generate"
  // runs -- doesn't touch any other entry already on screen.
  const setAsDefaultDetailLevel = async (level: DescriptionDetailLevel) => {
    setDefaultDetailLevel(level);
    if (!userId) return;
    await supabase.from("profiles").update({ auto_time_entry_detail_level: level }).eq("id", userId);
  };

  // Picking a timekeeper for an unresolved email entry -- auto-checks it
  // too, same "ready to go" default every other row starts with.
  const assignTimekeeper = (key: string, option: StaffOption) => {
    updateEntry(key, { userId: option.userId, userInitials: option.initials, userName: option.name });
    setChecked(prev => new Set(prev).add(key));
  };

  const handleSubmit = async () => {
    const toSubmit = entries.filter(e => checked.has(e.key));
    if (!toSubmit.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/time-entries/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: toSubmit.map(e => ({
            key: e.key, userId: e.userId, matterId: e.matterId, description: e.description,
            hours: e.hours, date: e.date, sourceTaskIds: e.sourceTaskIds, sourceEmailIds: e.sourceEmailIds,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not submit time entries");
      const results: { key: string; ok: boolean; error?: string }[] = json.results || [];
      const succeededOrDuplicate = new Set(results.filter(r => r.ok || r.error?.startsWith("Already recorded")).map(r => r.key));
      const notes: Record<string, string> = {};
      for (const r of results) if (!r.ok && !r.error?.startsWith("Already recorded")) notes[r.key] = r.error || "Could not submit";
      setEntries(prev => prev.filter(e => !succeededOrDuplicate.has(e.key)));
      setChecked(prev => { const next = new Set(prev); for (const k of succeededOrDuplicate) next.delete(k); return next; });
      setFailedNotes(notes);
      // At least one real entry was created -- refetch the dashboard's own
      // records (see AutoTimeRecordingButtonWidget's onDataChanged) so the
      // Time & Fee Entries grid shows it without a page refresh.
      if (results.some(r => r.ok)) onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit time entries");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex pointer-events-none">
      <div className="relative ml-auto w-[560px] max-w-full bg-white h-full shadow-2xl flex flex-col pointer-events-auto border-l border-slate-200">
        <div className="flex items-center justify-between px-6 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">{label}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 pt-4 shrink-0">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-full text-[11px] font-bold outline-none" />
          {isAdmin && (
            <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold">
              <button onClick={() => setScope("mine")} className={`px-3 py-1 rounded-full transition-all ${scope === "mine" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>My day</button>
              <button onClick={() => setScope("all")} className={`px-3 py-1 rounded-full transition-all ${scope === "all" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>Everyone's day (Admin)</button>
            </div>
          )}
          <button onClick={generate} disabled={loading} title="Regenerate" className="ml-auto p-1.5 text-slate-300 hover:text-indigo-600 disabled:opacity-40 transition-colors">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>

        {entries.length > 0 && (
          <div className="flex items-center gap-2 px-6 pt-2.5 shrink-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Descriptions</span>
            <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold">
              {DETAIL_LEVELS.map(level => (
                <button key={level} onClick={() => regenerateAllDescriptions(level)} disabled={bulkRegenerating}
                  title={`Set every entry's description to ${level}`}
                  className={`px-3 py-1 rounded-full capitalize transition-all disabled:opacity-40 ${bulkLevel === level ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                  {level}
                </button>
              ))}
            </div>
            {bulkRegenerating && <Loader2 size={12} className="animate-spin text-indigo-400" />}
            <button onClick={() => setAsDefaultDetailLevel(bulkLevel)}
              title="Use this detail level by default for future generates"
              className="flex items-center gap-1 text-[9px] font-bold text-slate-300 hover:text-indigo-600 transition-colors">
              <Star size={10} className={defaultDetailLevel === bulkLevel ? "fill-indigo-500 text-indigo-500" : ""} />
              {defaultDetailLevel === bulkLevel ? "Default" : "Set as default"}
            </button>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-3 px-3 py-2.5 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-red-600 font-medium">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading || !defaultDetailLevel ? (
            <div className="flex items-center justify-center py-16 text-slate-300"><Loader2 size={20} className="animate-spin" /></div>
          ) : entries.length === 0 ? (
            <p className="text-center text-[11px] text-slate-300 italic py-10">
              {scope === "all" ? "No completed tasks or emails found for anyone that day" : "No completed tasks or emails found for that day"}
            </p>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 px-1 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-3.5 h-3.5 rounded accent-indigo-600" />
                Select all ({assignableEntries.length}{assignableEntries.length !== entries.length ? ` of ${entries.length}` : ""})
              </label>
              {entries.map(e => (
                <div key={e.key} className={`border rounded-2xl p-3 space-y-2 ${e.userId ? "border-slate-200" : "border-amber-200 bg-amber-50/30"}`}>
                  <div className="flex items-start gap-2.5">
                    <input type="checkbox" checked={checked.has(e.key)} onChange={() => toggleOne(e.key)} disabled={!e.userId}
                      className="mt-1 w-3.5 h-3.5 rounded accent-indigo-600 shrink-0 disabled:opacity-30" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isAdmin ? (
                          // Admin can reassign any entry's timekeeper, not
                          // just fill in one that attribution couldn't
                          // resolve -- same assignTimekeeper path either
                          // way, just pre-selected to the current owner
                          // when there already is one.
                          <select
                            value={e.userId || ""}
                            onChange={ev => {
                              const opt = staffOptions.find(s => s.userId === ev.target.value);
                              if (opt) assignTimekeeper(e.key, opt);
                            }}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border outline-none ${e.userId ? "border-slate-200 bg-white text-slate-600" : "border-amber-300 bg-white text-amber-700"}`}
                          >
                            {!e.userId && <option value="" disabled>Assign timekeeper…</option>}
                            {staffOptions.map(s => <option key={s.userId} value={s.userId}>{s.name}</option>)}
                          </select>
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold flex items-center justify-center shrink-0" title={e.userName || undefined}>{e.userInitials}</span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium">{e.date}</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] font-bold text-slate-500">{matterLabel}: {e.matterLabel}</span>
                      </div>
                      <textarea value={e.description} onChange={ev => updateEntry(e.key, { description: ev.target.value })} rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none" />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[9px] font-bold">
                          {DETAIL_LEVELS.map(level => (
                            <button key={level} onClick={() => regenerateDescription(e.key, level)} disabled={regeneratingKeys.has(e.key)}
                              className={`px-2 py-1 rounded-full capitalize transition-all disabled:opacity-40 ${e.detailLevel === level ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                              {level}
                            </button>
                          ))}
                        </div>
                        {regeneratingKeys.has(e.key) && <Loader2 size={11} className="animate-spin text-indigo-400" />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="number" step="0.1" min="0.1" value={e.hours}
                          onChange={ev => updateEntry(e.key, { hours: Math.max(0.1, Number(ev.target.value) || 0.1) })}
                          className="w-20 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-bold outline-none" />
                        <span className="text-[10px] text-slate-400 font-medium">hours</span>
                        {e.emailPreviews.length > 0 && (
                          <button onClick={() => toggleExpanded(e.key)}
                            className="ml-auto flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">
                            <Mail size={11} />
                            {e.emailPreviews.length} email{e.emailPreviews.length !== 1 ? "s" : ""}
                            {expandedKeys.has(e.key) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        )}
                      </div>
                      {expandedKeys.has(e.key) && (
                        <div className="space-y-1.5 pt-1">
                          {e.emailPreviews.map((p, i) => (
                            <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2 text-[10px] text-slate-600">
                              <p className="font-bold text-slate-700 truncate">{p.subject || "(no subject)"}</p>
                              {p.fromName && <p className="text-slate-400">From: {p.fromName}</p>}
                              {p.snippet && <p className="mt-0.5 text-slate-500">{p.snippet}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {failedNotes[e.key] && <p className="text-[10px] text-red-500 font-medium">{failedNotes[e.key]}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {entries.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 shrink-0">
            <button onClick={handleSubmit} disabled={submitting || checked.size === 0}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {scope === "all" ? `Push ${checked.size} selected` : `Submit ${checked.size} selected`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
