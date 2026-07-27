// app/public/updates/[slug]/page.tsx
// GENUINELY UNAUTHENTICATED client-facing page -- no supabase.auth calls
// anywhere in this file or the API routes it talks to. Modeled on
// app/public/documents/[pageId]/page.tsx's PIN-gate + localStorage cache
// pattern. Shows a client's matters grouped into named groups, each as its
// own card (not a shared-header table) so per-matter field labels -- e.g.
// "Settlement Date" -- can differ without fighting a shared column header.
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Lock, Building2, MessageSquarePlus } from "lucide-react";

interface FieldDef { id: string; label: string; fieldSource: string; }
interface Note { id: string; date: string; body: string; author: string | null; source: "staff" | "client"; }
interface Item { id: string; matterName: string; values: Record<string, any>; notes: Note[]; }
interface Group { id: string; name: string; items: Item[]; }
interface PageData { title: string; clientLabel: string | null; requiresCode: boolean; fieldDefs: FieldDef[]; groups: Group[]; ungrouped: Item[]; }

const codeCacheKey = (slug: string) => `client_update_code_${slug}`;
function getCachedCode(slug: string): string | null {
  try { return localStorage.getItem(codeCacheKey(slug)); } catch { return null; }
}
function setCachedCode(slug: string, code: string) {
  try { localStorage.setItem(codeCacheKey(slug), code); } catch { /* ignore */ }
}
function clearCachedCode(slug: string) {
  try { localStorage.removeItem(codeCacheKey(slug)); } catch { /* ignore */ }
}

function formatValue(v: any): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    return new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return String(v);
}

function MatterCard({ item, fieldDefs, onAddNote }: { item: Item; fieldDefs: FieldDef[]; onAddNote: (itemId: string, note: string) => Promise<void> }) {
  const [noteInput, setNoteInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!noteInput.trim()) return;
    setSubmitting(true);
    await onAddNote(item.id, noteInput.trim());
    setNoteInput("");
    setSubmitting(false);
  };

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 p-6 space-y-5">
      <p className="text-[13px] font-bold text-slate-800">{item.matterName}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {fieldDefs.map(f => (
          <div key={f.id}>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{f.label}</p>
            <p className="text-[13px] text-slate-700">{formatValue(item.values[f.id])}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Notes</p>
        {item.notes.length === 0 && <p className="text-[12px] text-slate-300 italic">No notes yet</p>}
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {item.notes.map(n => (
            <div key={n.id} className="flex items-start gap-2 text-[12px]">
              <span className="text-slate-400 shrink-0 w-20">{formatValue(n.date)}</span>
              <span className={`flex-1 ${n.source === "client" ? "text-indigo-700" : "text-slate-600"}`}>
                {n.body}
                {n.source === "client" && <span className="ml-1.5 text-[9px] uppercase font-bold text-indigo-400">you</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <input value={noteInput} onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Add a note or question..."
            className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
          <button onClick={submit} disabled={submitting || !noteInput.trim()}
            className="p-2 text-indigo-600 hover:text-indigo-800 disabled:opacity-30 transition-colors shrink-0">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientUpdatePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PageData | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const fetchPage = useCallback(async (code?: string) => {
    const url = code ? `/api/client-update-pages/public/${slug}?code=${encodeURIComponent(code)}` : `/api/client-update-pages/public/${slug}`;
    const res = await fetch(url);
    const json = await res.json();
    return { ok: res.ok, json };
  }, [slug]);

  const load = useCallback(async () => {
    setLoading(true);
    const cachedCode = getCachedCode(slug);
    if (cachedCode) {
      const attempt = await fetchPage(cachedCode);
      if (attempt.ok && !attempt.json.requiresCode) {
        setData(attempt.json);
        setLoading(false);
        return;
      }
      clearCachedCode(slug);
    }
    const { ok, json } = await fetchPage();
    if (!ok) { setError(json.error || "This page is not available"); setLoading(false); return; }
    if (json.requiresCode) { setData(json); setNeedsCode(true); setLoading(false); return; }
    setData(json);
    setLoading(false);
  }, [fetchPage, slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data?.title) document.title = data.title; }, [data?.title]);

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return;
    setCheckingCode(true);
    setCodeError(null);
    const code = codeInput.trim();
    const { ok, json } = await fetchPage(code);
    setCheckingCode(false);
    if (!ok) { setCodeError(json.error || "Incorrect access code"); return; }
    setCachedCode(slug, code);
    setNeedsCode(false);
    setData(json);
  };

  const handleAddNote = async (itemId: string, note: string) => {
    const cachedCode = getCachedCode(slug);
    const res = await fetch(`/api/client-update-pages/public/${slug}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, note, code: cachedCode }),
    });
    if (!res.ok) return;
    const { note: created } = await res.json();
    setData(prev => {
      if (!prev) return prev;
      const addTo = (items: Item[]) => items.map(i => i.id === itemId ? { ...i, notes: [created, ...i.notes] } : i);
      return { ...prev, groups: prev.groups.map(g => ({ ...g, items: addTo(g.items) })), ungrouped: addTo(prev.ungrouped) };
    });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-[32px] border border-slate-200 p-8 text-center space-y-2">
          <p className="text-[13px] font-bold text-slate-800">This page is not available</p>
          <p className="text-[12px] text-slate-500">The link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-[32px] border border-slate-200 p-8 text-center space-y-4">
          <Lock size={28} className="text-indigo-600 mx-auto" />
          <div>
            <p className="text-[15px] font-bold text-slate-800">{data.title}</p>
            <p className="text-[12px] text-slate-500 mt-1">Enter the PIN you were given to continue.</p>
          </div>
          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value); setCodeError(null); }}
            onKeyDown={e => { if (e.key === "Enter") handleCodeSubmit(); }}
            placeholder="PIN"
            autoFocus
            className="w-full px-4 py-3 border border-slate-200 rounded-full text-[14px] font-bold tracking-wider text-center outline-none focus:border-indigo-400" />
          {codeError && <p className="text-[11px] text-red-500">{codeError}</p>}
          <button onClick={handleCodeSubmit} disabled={checkingCode || !codeInput.trim()}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {checkingCode ? <Loader2 size={14} className="animate-spin" /> : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-[18px] font-bold text-slate-800">{data.title}</h1>
          {data.clientLabel && <p className="text-[12px] text-slate-400 mt-0.5">{data.clientLabel}</p>}
        </div>

        {data.groups.map(g => (
          <div key={g.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-slate-400" />
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{g.name}</p>
            </div>
            <div className="space-y-4">
              {g.items.map(item => (
                <MatterCard key={item.id} item={item} fieldDefs={data.fieldDefs} onAddNote={handleAddNote} />
              ))}
            </div>
          </div>
        ))}

        {data.ungrouped.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Ungrouped</p>
            <div className="space-y-4">
              {data.ungrouped.map(item => (
                <MatterCard key={item.id} item={item} fieldDefs={data.fieldDefs} onAddNote={handleAddNote} />
              ))}
            </div>
          </div>
        )}

        {data.groups.length === 0 && data.ungrouped.length === 0 && (
          <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-12">No matters on this page yet</p>
        )}
      </div>
    </div>
  );
}
